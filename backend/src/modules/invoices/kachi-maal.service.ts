import {
  BoriThelaMode,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  createVoucherInTx,
  ensureKachiMaalAccounts,
  getActiveFinancialYearId,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { getSystemPreferences } from '../preferences/preferences.service';
import {
  computeKachiMaalInvoiceTotals,
  computeKachiMaalRow,
  roundMoney,
} from './kachi-maal.calculations';

const TYPE_PREFIX = 'KM';

async function nextReference(tx: Prisma.TransactionClient) {
  const count = await tx.invoice.count({ where: { type: InvoiceType.KACHI_MAAL } });
  return `${TYPE_PREFIX}-${String(count + 1).padStart(5, '0')}`;
}

export async function getNextKachiMaalReference() {
  return prisma.$transaction(async (tx) => {
    await ensureKachiMaalAccounts(tx);
    return { reference: await nextReference(tx) };
  });
}

export type KachiMaalLineInput = {
  partyAccountId: number;
  jins?: string;
  qism?: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
  ratePerMaund: number;
  bardanaQty?: number | null;
  bardanaRate?: number | null;
};

export type CreateKachiMaalInput = {
  invoiceDate: string;
  billNo?: string;
  gariNo?: string;
  jins?: string;
  qism?: string;
  tafseel?: string;
  debitAccountId: number;
  miscAmount?: number;
  lowerBardanaMode?: BoriThelaMode | null;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
  lines: KachiMaalLineInput[];
  createdById: number;
};

function bardanaAccountId(
  mode: BoriThelaMode,
  accounts: Awaited<ReturnType<typeof ensureKachiMaalAccounts>>,
) {
  return mode === BoriThelaMode.BORI ? accounts.bori.id : accounts.thela.id;
}

async function assertPurchasePartyAccount(tx: Prisma.TransactionClient, accountId: number) {
  const account = await tx.account.findFirst({
    where: { id: accountId, isActive: true },
    include: { category: true },
  });
  if (!account) throw new AppError(400, 'Invalid purchase party account');
  const name = account.category.name;
  if (
    name !== KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE
    && name !== KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE
  ) {
    throw new AppError(400, 'Party must be an Int. or Ext. Purchase Party account');
  }
  return account;
}

async function assertDebitAccount(tx: Prisma.TransactionClient, accountId: number) {
  const account = await tx.account.findFirst({
    where: { id: accountId, isActive: true },
    include: { category: true },
  });
  if (!account) throw new AppError(400, 'Invalid debit account');
  const allowed = new Set<string>([
    KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE,
    KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
    KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
  ]);
  if (!allowed.has(account.category.name)) {
    throw new AppError(400, 'Debit account must be a Purchase Party or Sale Party account');
  }
  return account;
}

type ComputedLine = KachiMaalLineInput & {
  totalWeightKg: number;
  amount: number;
  bardanaAmount: number | null;
  netCreditToParty: number;
};

function buildComputedLines(
  lines: KachiMaalLineInput[],
  prefs: { paleDariPercent: number; brokeryPercent: number },
): ComputedLine[] {
  return lines.map((line) => {
    const computed = computeKachiMaalRow(line, prefs);
    if (!(computed.amount > 0)) {
      throw new AppError(400, 'Each line must have a positive goods amount');
    }
    if (!(line.bhartii > 0)) {
      throw new AppError(400, 'Bhartii must be greater than zero on every line');
    }
    return { ...line, ...computed };
  });
}

function buildVoucherPlan(
  invoiceRef: string,
  debitAccountId: number,
  computedLines: ComputedLine[],
  totals: ReturnType<typeof computeKachiMaalInvoiceTotals>,
  systemAccounts: Awaited<ReturnType<typeof ensureKachiMaalAccounts>>,
  lowerBardanaMode: BoriThelaMode | null | undefined,
) {
  type PlannedVoucher = {
    debitAccountId: number;
    creditAccountId: number;
    amount: number;
    reference: string;
    description: string;
  };

  const planned: PlannedVoucher[] = [];
  let seq = 1;
  const ref = (suffix: string) => `${invoiceRef}/${suffix}`;

  for (let i = 0; i < computedLines.length; i += 1) {
    const line = computedLines[i]!;
    planned.push({
      debitAccountId,
      creditAccountId: line.partyAccountId,
      amount: line.amount,
      reference: ref(`G${seq}`),
      description: `Kachi Maal — goods row ${i + 1}`,
    });
    seq += 1;

    if (line.bardanaAmount != null && line.bardanaAmount > 0) {
      planned.push({
        debitAccountId: bardanaAccountId(line.boriOrThelaMode, systemAccounts),
        creditAccountId: line.partyAccountId,
        amount: line.bardanaAmount,
        reference: ref(`B${seq}`),
        description: `Kachi Maal — row ${i + 1} bardana`,
      });
      seq += 1;
    }
  }

  if (totals.totalPaleDari > 0) {
    planned.push({
      debitAccountId,
      creditAccountId: systemAccounts.mazduri.id,
      amount: totals.totalPaleDari,
      reference: ref('MAZ'),
      description: 'Kachi Maal — Pale Dari / Mazduri',
    });
  }

  if (totals.totalBrokery > 0) {
    planned.push({
      debitAccountId,
      creditAccountId: systemAccounts.broker.id,
      amount: totals.totalBrokery,
      reference: ref('BRK'),
      description: 'Kachi Maal — Brokery',
    });
  }

  if (totals.marketFeeAmount > 0) {
    planned.push({
      debitAccountId,
      creditAccountId: systemAccounts.marketFee.id,
      amount: totals.marketFeeAmount,
      reference: ref('MKT'),
      description: 'Kachi Maal — Market Fee',
    });
  }

  const miscAmount = roundMoney(
    totals.totalDebitAmount
      - totals.totalGoodsAmount
      - totals.totalPaleDari
      - totals.totalBrokery
      - totals.marketFeeAmount
      - totals.profitAmount,
  );

  if (miscAmount > 0) {
    planned.push({
      debitAccountId,
      creditAccountId: systemAccounts.misc.id,
      amount: miscAmount,
      reference: ref('MSC'),
      description: 'Kachi Maal — Misc',
    });
  }

  if (totals.profitAmount > 0) {
    planned.push({
      debitAccountId,
      creditAccountId: systemAccounts.commission.id,
      amount: totals.profitAmount,
      reference: ref('DAM'),
      description: 'Kachi Maal — Daami / Commission',
    });
  }

  if (totals.lowerBardanaAmount != null && totals.lowerBardanaAmount > 0) {
    if (!lowerBardanaMode) {
      throw new AppError(400, 'Lower bardana requires Bori/Thela selection');
    }
    planned.push({
      debitAccountId,
      creditAccountId: bardanaAccountId(lowerBardanaMode, systemAccounts),
      amount: totals.lowerBardanaAmount,
      reference: ref('LB'),
      description: 'Kachi Maal — lower section bardana',
    });
  }

  const totalDebits = roundMoney(planned.reduce((s, v) => s + v.amount, 0));
  const totalCredits = totalDebits;

  return { planned, totalDebits, totalCredits, miscAmount };
}

export async function createKachiMaalInvoice(data: CreateKachiMaalInput) {
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const totals = computeKachiMaalInvoiceTotals(
    computedLines,
    prefs,
    data.miscAmount ?? 0,
    data.lowerBardanaQty,
    data.lowerBardanaRate,
  );

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureKachiMaalAccounts(tx);
    await assertDebitAccount(tx, data.debitAccountId);
    for (const line of computedLines) {
      await assertPurchasePartyAccount(tx, line.partyAccountId);
    }

    const reference = await nextReference(tx);
    const { planned, totalDebits, totalCredits, miscAmount } = buildVoucherPlan(
      reference,
      data.debitAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.KACHI_MAAL,
        status: InvoiceStatus.POSTED,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || null,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        debitAccountId: data.debitAccountId,
        miscAmount,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.totalDebitAmount,
        financialYearId,
        createdById: data.createdById,
        kachiMaalLines: {
          create: computedLines.map((line, index) => ({
            partyAccountId: line.partyAccountId,
            jins: line.jins?.trim() || null,
            qism: line.qism?.trim() || null,
            boriOrThelaMode: line.boriOrThelaMode,
            bagCount: line.bagCount,
            bhartii: line.bhartii,
            dharanCount: line.dharanCount,
            looseKg: line.looseKg,
            totalWeightKg: line.totalWeightKg,
            ratePerMaund: line.ratePerMaund,
            amount: line.amount,
            bardanaQty: line.bardanaQty ?? null,
            bardanaRate: line.bardanaRate ?? null,
            bardanaAmount: line.bardanaAmount,
            netCreditToParty: line.netCreditToParty,
            sortOrder: index,
          })),
        },
      },
    });

    for (const voucherData of planned) {
      const voucher = await createVoucherInTx(tx, {
        type: VoucherType.KACHI_MAAL,
        debitAccountId: voucherData.debitAccountId,
        creditAccountId: voucherData.creditAccountId,
        amount: voucherData.amount,
        date: data.invoiceDate,
        description: voucherData.description,
        reference: voucherData.reference,
        createdById: data.createdById,
      });

      await tx.invoiceVoucher.create({
        data: { invoiceId: invoice.id, voucherId: voucher.id },
      });
    }

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        kachiMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
        vouchers: { include: { voucher: true } },
        debitAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function previewKachiMaalTotals(data: {
  lines: KachiMaalLineInput[];
  miscAmount?: number;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
}) {
  const prefs = await getSystemPreferences();
  const computedLines = data.lines.map((line) => ({
    ...computeKachiMaalRow(line, prefs),
    bhartii: line.bhartii,
    bardanaAmount: computeKachiMaalRow(line, prefs).bardanaAmount,
  }));
  return computeKachiMaalInvoiceTotals(
    computedLines,
    prefs,
    data.miscAmount ?? 0,
    data.lowerBardanaQty,
    data.lowerBardanaRate,
  );
}
