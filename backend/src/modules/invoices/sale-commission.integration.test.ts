import { AccountType, BoriThelaMode } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import {
  ensureSaleCommissionAccounts,
  getTrialBalance,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { updateSystemPreferences } from '../preferences/preferences.service';
import { roundMoney } from './sale-commission.calculations';
import { createSaleCommissionInvoice } from './sale-commission.service';

async function ensureAccountInCategory(
  categoryName: string,
  accountName: string,
  type: AccountType,
  code: string,
) {
  const category = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: categoryName },
  });
  if (!category) throw new Error(`Category missing: ${categoryName}`);

  let account = await prisma.account.findFirst({
    where: { isActive: true, name: accountName, categoryId: category.id },
    include: { ledger: true },
  });
  if (!account) {
    account = await prisma.account.create({
      data: { categoryId: category.id, name: accountName, code, type },
      include: { ledger: true },
    });
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  } else if (!account.ledger) {
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  }
  return account;
}

async function voucherLegs(voucherId: number) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { voucherId, isReversal: false },
    include: { ledger: { include: { account: true } } },
    orderBy: { id: 'asc' },
  });
  return entries.map((entry) => ({
    accountId: entry.ledger.accountId,
    accountName: entry.ledger.account.name,
    type: entry.type,
    amount: Number(entry.amount),
    description: entry.notes,
  }));
}

describe('Sale on Commission posting', () => {
  let userId: number;
  let purchasePartyId: number;
  let purchasePartyBId: number;
  let salePartyId: number;
  let commissionId: number;
  let dalaliId: number;
  let sutliId: number;
  let mazduriId: number;
  let marketFeeId: number;
  let munshianaId: number;
  let miscId: number;
  let thelaId: number;
  let invoiceDate: string;

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await updateSystemPreferences({
      daamiPercent: 1.6,
      commissionPercent: 1,
      dalaliPercent: 0.5,
      sutliRate: 2,
      mazduriPerBagRate: 40,
      marketFeeRate: 1.2,
    });

    await prisma.$transaction(async (tx) => {
      const system = await ensureSaleCommissionAccounts(tx);
      commissionId = system.commission.id;
      dalaliId = system.dalali.id;
      sutliId = system.sutli.id;
      mazduriId = system.mazduri.id;
      marketFeeId = system.marketFee.id;
      munshianaId = system.munshiana.id;
      miscId = system.misc.id;
      thelaId = system.thela.id;
    });

    purchasePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        'SC Seller A',
        AccountType.LIABILITY,
        'SC-SELL-A',
      )
    ).id;
    purchasePartyBId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.INT_PURCHASE,
        'SC Seller B',
        AccountType.LIABILITY,
        'SC-SELL-B',
      )
    ).id;
    salePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
        'SC Mill Buyer',
        AccountType.ASSET,
        'SC-BUY-A',
      )
    ).id;
  });

  it('balances: Sale Party net debit equals all purchase + fee credits (no Maal Khata / no plug)', async () => {
    // Sample-verified goods: 6000kg @ 4275 → 641250 + dammi 10260
    const invoice = await createSaleCommissionInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      billNo: 'SC-BILL-1',
      jins: 'Wheat',
      munshianaAmount: 500,
      miscAmount: 100,
      lowerBardanaMode: BoriThelaMode.THELA,
      lowerBardanaQty: 552,
      lowerBardanaRate: 45,
      lines: [
        {
          partyAccountId: purchasePartyId,
          jins: 'Wheat',
          boriOrThelaMode: BoriThelaMode.THELA,
          bagCount: 551,
          bhartii: 10,
          dharanCount: 0,
          looseKg: 490,
          ratePerMaund: 4275,
          dammiChecked: true,
        },
      ],
      createdById: userId,
    });

    expect(invoice.reference).toMatch(/^SC-/);
    expect(invoice.type).toBe('SALE_COMMISSION');
    expect(invoice.legacyInventoryPosting).toBe(false);
    expect(invoice.productId).toBeNull();

    const voucher = invoice.vouchers[0]!.voucher;
    expect(voucher.type).toBe('SALE_COMMISSION');

    const legs = await voucherLegs(voucher.id);
    const totalDebit = roundMoney(
      legs.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0),
    );
    const totalCredit = roundMoney(
      legs.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0),
    );
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(Number(invoice.total));
    expect(Number(invoice.total)).toBe(710_474.55);

    // Separate goods + dammi legs to purchase party
    expect(legs).toEqual(
      expect.arrayContaining([
        { accountId: salePartyId, accountName: expect.any(String), type: 'DEBIT', amount: 641_250, description: expect.stringContaining('Row 1') },
        { accountId: purchasePartyId, accountName: expect.any(String), type: 'CREDIT', amount: 641_250, description: expect.stringContaining('Row 1') },
        { accountId: salePartyId, accountName: expect.any(String), type: 'DEBIT', amount: 10_260, description: expect.stringContaining('Dammi') },
        { accountId: purchasePartyId, accountName: expect.any(String), type: 'CREDIT', amount: 10_260, description: expect.stringContaining('Dammi') },
        { accountId: commissionId, accountName: expect.any(String), type: 'CREDIT', amount: 6_515.1, description: 'Commission' },
        { accountId: dalaliId, accountName: expect.any(String), type: 'CREDIT', amount: 3_206.25, description: 'Dalali' },
        { accountId: sutliId, accountName: expect.any(String), type: 'CREDIT', amount: 1_102, description: 'Sutli' },
        { accountId: mazduriId, accountName: expect.any(String), type: 'CREDIT', amount: 22_040, description: 'Labour (Mazduri)' },
        { accountId: marketFeeId, accountName: expect.any(String), type: 'CREDIT', amount: 661.2, description: 'Market Fee' },
        { accountId: munshianaId, accountName: expect.any(String), type: 'CREDIT', amount: 500, description: 'Munshiana' },
        { accountId: miscId, accountName: expect.any(String), type: 'CREDIT', amount: 100, description: 'Misc' },
        { accountId: thelaId, accountName: expect.any(String), type: 'CREDIT', amount: 24_840, description: 'Bardana' },
      ]),
    );

    const salePartyDebits = roundMoney(
      legs
        .filter((l) => l.type === 'DEBIT' && l.accountId === salePartyId)
        .reduce((s, l) => s + l.amount, 0),
    );
    expect(salePartyDebits).toBe(Number(invoice.total));

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });

  it('posts per-row goods+dammi legs when the same purchase party appears twice', async () => {
    const invoice = await createSaleCommissionInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      billNo: 'SC-BILL-2',
      munshianaAmount: 0,
      miscAmount: 0,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyBId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 10,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
          dammiChecked: true,
        },
        {
          partyAccountId: purchasePartyBId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 5,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
          dammiChecked: false,
        },
      ],
      createdById: userId,
    });

    const voucher = invoice.vouchers[0]!.voucher;
    const legs = await voucherLegs(voucher.id);

    // Row1: 1000kg → 25 maund × 2000 = 50000 goods + 800 dammi
    // Row2: 500kg → 12.5 maund × 2000 = 25000 goods, no dammi
    const partyCredits = legs.filter(
      (l) => l.type === 'CREDIT' && l.accountId === purchasePartyBId,
    );
    expect(partyCredits).toHaveLength(3); // goods1, dammi1, goods2 — per-row, not merged
    expect(partyCredits.map((l) => l.amount).sort((a, b) => a - b)).toEqual([800, 25_000, 50_000]);

    const totalDebit = roundMoney(
      legs.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0),
    );
    const totalCredit = roundMoney(
      legs.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0),
    );
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(Number(invoice.total));
  });
});
