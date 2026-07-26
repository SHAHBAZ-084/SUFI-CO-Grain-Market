import {
  BoriThelaMode,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  Prisma,
  VoucherType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  createMultiLegVoucherInTx,
  ensureKachiMaalAccounts,
  getActiveFinancialYearId,
  KACHI_MAAL_CATEGORY_NAMES,
  type VoucherLeg,
} from '../accounting/accounting.service';
import { resolveMaalKhataAccountForProduct } from '../products/maal-khata';
import { getSystemPreferences } from '../preferences/preferences.service';
import {
  computePurchaseMaalInvoiceTotals,
  computePurchaseMaalRow,
  roundMoney,
  splitMazduriByParty,
} from './purchase-maal.calculations';

const TYPE_PREFIX = 'PM';

async function nextReference(tx: Prisma.TransactionClient) {
  const count = await tx.invoice.count({ where: { type: InvoiceType.PURCHASE_MAAL } });
  return `${TYPE_PREFIX}-${String(count + 1).padStart(5, '0')}`;
}

export async function getNextPurchaseMaalReference() {
  return prisma.$transaction(async (tx) => {
    await ensureKachiMaalAccounts(tx);
    return { reference: await nextReference(tx) };
  });
}

export type PurchaseMaalLineInput = {
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
  dammiChecked?: boolean;
};

export type CreatePurchaseMaalInput = {
  invoiceDate: string;
  productId: number;
  billNo?: string;
  gariNo?: string;
  jins?: string;
  qism?: string;
  tafseel?: string;
  debitAccountId: number;
  marketFeeEnabled?: boolean;
  mazduriEnabled?: boolean;
  lowerBardanaMode?: BoriThelaMode | null;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
  lines: PurchaseMaalLineInput[];
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

type ComputedLine = PurchaseMaalLineInput & {
  totalWeightKg: number;
  amount: number;
  bardanaAmount: number | null;
  dammiAmount: number;
  netCreditToParty: number;
};

function buildComputedLines(
  lines: PurchaseMaalLineInput[],
  prefs: { daamiPercent: number },
): ComputedLine[] {
  return lines.map((line) => {
    const computed = computePurchaseMaalRow(line, prefs);
    if (!(computed.amount > 0)) {
      throw new AppError(400, 'Each line must have a positive goods amount');
    }
    if (!(line.bhartii > 0)) {
      throw new AppError(400, 'Bhartii must be greater than zero on every line');
    }
    return { ...line, ...computed, dammiChecked: line.dammiChecked ?? false };
  });
}

function buildLedgerLegs(
  debitAccountId: number,
  maalKhataAccountId: number,
  computedLines: ComputedLine[],
  totals: ReturnType<typeof computePurchaseMaalInvoiceTotals>,
  systemAccounts: Awaited<ReturnType<typeof ensureKachiMaalAccounts>>,
  lowerBardanaMode: BoriThelaMode | null | undefined,
  mazduriEnabled: boolean,
) {
  const legs: VoucherLeg[] = [];

  if (totals.totalGoodsAmount > 0) {
    legs.push({
      accountId: maalKhataAccountId,
      type: LedgerEntryType.DEBIT,
      amount: totals.totalGoodsAmount,
      description: 'Purchase Maal — goods (Maal Khata)',
    });
  }

  const buyerAddonDebit = roundMoney(totals.totalDammiAmount + totals.marketFeeAmount);
  if (buyerAddonDebit > 0) {
    legs.push({
      accountId: debitAccountId,
      type: LedgerEntryType.DEBIT,
      amount: buyerAddonDebit,
      description: 'Purchase Maal — dammi & market fee',
    });
  }

  const mazduriShares = mazduriEnabled
    ? splitMazduriByParty(computedLines, totals.mazduriAmount, totals.totalGoodsAmount)
    : new Map<number, number>();

  const partyGoodsByAccount = new Map<number, number>();
  for (const line of computedLines) {
    const current = partyGoodsByAccount.get(line.partyAccountId) ?? 0;
    partyGoodsByAccount.set(line.partyAccountId, roundMoney(current + line.amount));
  }

  for (const [partyAccountId, goodsTotal] of partyGoodsByAccount) {
    const mazduriShare = mazduriShares.get(partyAccountId) ?? 0;
    const net = roundMoney(goodsTotal - mazduriShare);
    if (net <= 0) {
      throw new AppError(500, 'Party net settlement must be positive');
    }
    legs.push({
      accountId: partyAccountId,
      type: LedgerEntryType.CREDIT,
      amount: net,
      description: 'Purchase Maal — net settlement',
    });
  }

  for (let i = 0; i < computedLines.length; i += 1) {
    const line = computedLines[i]!;
    if (line.bardanaAmount != null && line.bardanaAmount > 0) {
      legs.push(
        {
          accountId: bardanaAccountId(line.boriOrThelaMode, systemAccounts),
          type: LedgerEntryType.DEBIT,
          amount: line.bardanaAmount,
          description: `Purchase Maal — row ${i + 1} bardana`,
        },
        {
          accountId: line.partyAccountId,
          type: LedgerEntryType.CREDIT,
          amount: line.bardanaAmount,
          description: `Purchase Maal — row ${i + 1} bardana`,
        },
      );
    }
  }

  if (totals.lowerBardanaAmount != null && totals.lowerBardanaAmount > 0) {
    if (!lowerBardanaMode) {
      throw new AppError(400, 'Lower bardana requires Bori/Thela selection');
    }
    legs.push(
      {
        accountId: debitAccountId,
        type: LedgerEntryType.DEBIT,
        amount: totals.lowerBardanaAmount,
        description: 'Purchase Maal — lower section bardana',
      },
      {
        accountId: bardanaAccountId(lowerBardanaMode, systemAccounts),
        type: LedgerEntryType.CREDIT,
        amount: totals.lowerBardanaAmount,
        description: 'Purchase Maal — lower section bardana',
      },
    );
  }

  if (totals.mazduriAmount > 0) {
    legs.push({
      accountId: systemAccounts.mazduri.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.mazduriAmount,
      description: 'Purchase Maal — Mazduri',
    });
  }

  if (totals.marketFeeAmount > 0) {
    legs.push({
      accountId: systemAccounts.marketFee.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.marketFeeAmount,
      description: 'Purchase Maal — Market Fee',
    });
  }

  if (totals.totalDammiAmount > 0) {
    legs.push({
      accountId: systemAccounts.commission.id,
      type: LedgerEntryType.CREDIT,
      amount: totals.totalDammiAmount,
      description: 'Purchase Maal — Dammi / Commission',
    });
  }

  const totalDebits = roundMoney(
    legs
      .filter((leg) => leg.type === LedgerEntryType.DEBIT)
      .reduce((sum, leg) => sum + leg.amount, 0),
  );
  const totalCredits = roundMoney(
    legs
      .filter((leg) => leg.type === LedgerEntryType.CREDIT)
      .reduce((sum, leg) => sum + leg.amount, 0),
  );

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new AppError(500, 'Purchase Maal voucher debits and credits do not balance');
  }

  return { legs, totalDebits, totalCredits };
}

export async function createPurchaseMaalInvoice(data: CreatePurchaseMaalInput) {
  if (data.lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  const prefs = await getSystemPreferences();
  const computedLines = buildComputedLines(data.lines, prefs);
  const marketFeeEnabled = data.marketFeeEnabled ?? false;
  const mazduriEnabled = data.mazduriEnabled ?? false;
  const totals = computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled,
    mazduriEnabled,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });

  return prisma.$transaction(async (tx) => {
    await getActiveFinancialYearId(tx);
    const systemAccounts = await ensureKachiMaalAccounts(tx);
    const { product, maalKhataAccountId } = await resolveMaalKhataAccountForProduct(tx, data.productId);
    await assertDebitAccount(tx, data.debitAccountId);
    for (const line of computedLines) {
      await assertPurchasePartyAccount(tx, line.partyAccountId);
    }

    const reference = await nextReference(tx);
    const { legs, totalDebits, totalCredits } = buildLedgerLegs(
      data.debitAccountId,
      maalKhataAccountId,
      computedLines,
      totals,
      systemAccounts,
      data.lowerBardanaMode,
      mazduriEnabled,
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new AppError(500, 'Invoice debits and credits do not balance — save aborted');
    }

    const financialYearId = await getActiveFinancialYearId(tx);
    const invoiceDate = new Date(data.invoiceDate);

    const invoice = await tx.invoice.create({
      data: {
        type: InvoiceType.PURCHASE_MAAL,
        status: InvoiceStatus.POSTED,
        reference,
        invoiceDate,
        billNo: data.billNo?.trim() || null,
        gariNo: data.gariNo?.trim() || null,
        jins: data.jins?.trim() || product.name,
        qism: data.qism?.trim() || null,
        tafseel: data.tafseel?.trim() || null,
        notes: data.tafseel?.trim() || null,
        productId: product.id,
        legacyInventoryPosting: false,
        debitAccountId: data.debitAccountId,
        marketFeeEnabled,
        mazduriEnabled,
        lowerBardanaMode: data.lowerBardanaMode ?? null,
        lowerBardanaQty: data.lowerBardanaQty ?? null,
        lowerBardanaRate: data.lowerBardanaRate ?? null,
        lowerBardanaAmount: totals.lowerBardanaAmount,
        total: totals.totalDebitAmount,
        financialYearId,
        createdById: data.createdById,
        purchaseMaalLines: {
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
            dammiChecked: line.dammiChecked ?? false,
            dammiAmount: line.dammiAmount,
            netCreditToParty: line.netCreditToParty,
            sortOrder: index,
          })),
        },
      },
    });

    const voucher = await createMultiLegVoucherInTx(tx, {
      type: VoucherType.PURCHASE_MAAL,
      legs,
      amount: totalDebits,
      date: data.invoiceDate,
      description: `Purchase Maal Invoice ${reference}`,
      reference: invoice.reference,
      createdById: data.createdById,
    });

    await tx.invoiceVoucher.create({
      data: { invoiceId: invoice.id, voucherId: voucher.id },
    });

    return tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        purchaseMaalLines: { include: { partyAccount: true }, orderBy: { sortOrder: 'asc' } },
        product: { include: { account: true } },
        vouchers: { include: { voucher: { include: { ledgerEntries: true } } } },
        debitAccount: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  });
}

export async function previewPurchaseMaalTotals(data: {
  lines: PurchaseMaalLineInput[];
  marketFeeEnabled?: boolean;
  mazduriEnabled?: boolean;
  lowerBardanaQty?: number | null;
  lowerBardanaRate?: number | null;
}) {
  const prefs = await getSystemPreferences();
  const computedLines = data.lines.map((line) => ({
    ...computePurchaseMaalRow(line, prefs),
    bhartii: line.bhartii,
    dammiAmount: computePurchaseMaalRow(line, prefs).dammiAmount,
  }));
  return computePurchaseMaalInvoiceTotals(computedLines, prefs, {
    marketFeeEnabled: data.marketFeeEnabled ?? false,
    mazduriEnabled: data.mazduriEnabled ?? false,
    lowerBardanaQty: data.lowerBardanaQty,
    lowerBardanaRate: data.lowerBardanaRate,
  });
}
