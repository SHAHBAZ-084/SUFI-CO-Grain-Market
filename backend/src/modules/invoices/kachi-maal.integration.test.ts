import { AccountType, BoriThelaMode } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import {
  ensureKachiMaalAccounts,
  getTrialBalance,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import { updateSystemPreferences } from '../preferences/preferences.service';
import {
  computeKachiMaalInvoiceTotals,
  computeKachiMaalRow,
} from './kachi-maal.calculations';
import { createKachiMaalInvoice } from './kachi-maal.service';

async function ensureAccountInCategory(categoryName: string, accountName: string, type: AccountType, code: string) {
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

describe('Kachi Maal Test 1 — minimal case', () => {
  let userId: number;
  let partyAId: number;
  let traderXId: number;
  let mazduriId: number;
  let brokerId: number;
  let commissionId: number;
  let invoiceDate: string;

  const prefs = {
    daamiPercent: 1.6,
    paleDariPercent: 0.85,
    brokeryPercent: 0.15,
    marketFeeRate: 0,
  };

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await updateSystemPreferences(prefs);

    await prisma.$transaction(async (tx) => {
      const system = await ensureKachiMaalAccounts(tx);
      mazduriId = system.mazduri.id;
      brokerId = system.broker.id;
      commissionId = system.commission.id;
    });

    const partyA = await ensureAccountInCategory(
      KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
      'Party A',
      AccountType.LIABILITY,
      'KM-PARTY-A',
    );
    partyAId = partyA.id;

    const traderX = await ensureAccountInCategory(
      KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
      'Trader X',
      AccountType.ASSET,
      'KM-TRADER-X',
    );
    traderXId = traderX.id;
  });

  it('computes row and invoice totals exactly', () => {
    const row = computeKachiMaalRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        ratePerMaund: 2000,
        bardanaQty: null,
        bardanaRate: null,
      },
      prefs,
    );

    expect(row.totalWeightKg).toBe(1000);
    expect(row.amount).toBe(50_000);
    expect(row.bardanaAmount).toBeNull();
    expect(row.netCreditToParty).toBe(49_500);

    const totals = computeKachiMaalInvoiceTotals(
      [{ ...row, bhartii: 100, bardanaAmount: null }],
      prefs,
      0,
      null,
      null,
    );

    expect(totals.totalPaleDari).toBe(425);
    expect(totals.totalBrokery).toBe(75);
    expect(totals.marketFeeAmount).toBe(0);
    expect(totals.profitAmount).toBe(800);
    expect(totals.totalDebitAmount).toBe(50_800);
    expect(totals.lowerBardanaAmount).toBeNull();
  });

  it('posts four vouchers; debits = credits = 51,300; trial balance balanced', async () => {
    const invoice = await createKachiMaalInvoice({
      invoiceDate,
      debitAccountId: traderXId,
      miscAmount: 0,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: partyAId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 10,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
          bardanaQty: null,
          bardanaRate: null,
        },
      ],
      createdById: userId,
    });

    expect(invoice.status).toBe('POSTED');
    expect(Number(invoice.total)).toBe(50_800);

    const vouchers = invoice.vouchers.map((iv) => iv.voucher);
    expect(vouchers).toHaveLength(4);

    type VoucherRow = { debitId: number; creditId: number; amount: number };
    const pairs: VoucherRow[] = vouchers.map((v) => ({
      debitId: v.debitAccountId,
      creditId: v.creditAccountId,
      amount: Number(v.amount),
    }));

    expect(pairs).toEqual(
      expect.arrayContaining([
        { debitId: traderXId, creditId: partyAId, amount: 50_000 },
        { debitId: partyAId, creditId: mazduriId, amount: 425 },
        { debitId: partyAId, creditId: brokerId, amount: 75 },
        { debitId: traderXId, creditId: commissionId, amount: 800 },
      ]),
    );

    const totalDebit = pairs.reduce((s, v) => s + v.amount, 0);
    const totalCredit = totalDebit;
    expect(totalDebit).toBe(51_300);
    expect(totalCredit).toBe(51_300);

    for (const v of vouchers) {
      expect(v.type).toBe('KACHI_MAAL');
    }

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });
});

describe('Kachi Maal Test 2 — full case (two parties, bardana, market fee, misc, lower bardana)', () => {
  let userId: number;
  let partyAId: number;
  let partyBId: number;
  let traderXId: number;
  let boriId: number;
  let thelaId: number;
  let mazduriId: number;
  let brokerId: number;
  let marketFeeId: number;
  let miscId: number;
  let commissionId: number;
  let invoiceDate: string;

  const prefs = {
    daamiPercent: 1.6,
    paleDariPercent: 0.85,
    brokeryPercent: 0.15,
    marketFeeRate: 2,
  };

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await updateSystemPreferences(prefs);

    await prisma.$transaction(async (tx) => {
      const system = await ensureKachiMaalAccounts(tx);
      boriId = system.bori.id;
      thelaId = system.thela.id;
      mazduriId = system.mazduri.id;
      brokerId = system.broker.id;
      marketFeeId = system.marketFee.id;
      miscId = system.misc.id;
      commissionId = system.commission.id;
    });

    const partyA = await ensureAccountInCategory(
      KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
      'Party A',
      AccountType.LIABILITY,
      'KM-PARTY-A',
    );
    partyAId = partyA.id;

    const partyB = await ensureAccountInCategory(
      KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
      'Party B',
      AccountType.LIABILITY,
      'KM-PARTY-B',
    );
    partyBId = partyB.id;

    const traderX = await ensureAccountInCategory(
      KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
      'Trader X',
      AccountType.ASSET,
      'KM-TRADER-X',
    );
    traderXId = traderX.id;
  });

  it('computes two-row invoice totals exactly', () => {
    const row1 = computeKachiMaalRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        ratePerMaund: 2000,
        bardanaQty: 10,
        bardanaRate: 10,
      },
      prefs,
    );
    const row2 = computeKachiMaalRow(
      {
        bagCount: 5,
        bhartii: 120,
        dharanCount: 2,
        looseKg: 15,
        ratePerMaund: 1600,
        bardanaQty: null,
        bardanaRate: null,
      },
      prefs,
    );

    expect(row1.totalWeightKg).toBe(1000);
    expect(row1.amount).toBe(50_000);
    expect(row1.bardanaAmount).toBe(100);
    expect(row1.netCreditToParty).toBe(49_600);

    expect(row2.totalWeightKg).toBe(625);
    expect(row2.amount).toBe(25_000);
    expect(row2.bardanaAmount).toBeNull();
    expect(row2.netCreditToParty).toBe(24_750);

    const totals = computeKachiMaalInvoiceTotals(
      [
        { ...row1, bhartii: 100, bardanaAmount: row1.bardanaAmount },
        { ...row2, bhartii: 120, bardanaAmount: null },
      ],
      prefs,
      200,
      5,
      10,
    );

    expect(totals.totalGoodsAmount).toBe(75_000);
    expect(totals.totalPaleDari).toBe(637.5);
    expect(totals.totalBrokery).toBe(112.5);
    expect(totals.totalCalculatedBags).toBeCloseTo(15.208333, 4);
    expect(totals.marketFeeAmount).toBe(30.42);
    expect(totals.profitAmount).toBe(1200);
    expect(totals.lowerBardanaAmount).toBe(50);
    expect(totals.totalDebitAmount).toBe(76_430.42);
  });

  it('posts eleven vouchers; all legs sum to 77,330.42; trial balance balanced', async () => {
    const invoice = await createKachiMaalInvoice({
      invoiceDate,
      debitAccountId: traderXId,
      miscAmount: 200,
      lowerBardanaMode: BoriThelaMode.THELA,
      lowerBardanaQty: 5,
      lowerBardanaRate: 10,
      lines: [
        {
          partyAccountId: partyAId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 10,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
          bardanaQty: 10,
          bardanaRate: 10,
        },
        {
          partyAccountId: partyBId,
          boriOrThelaMode: BoriThelaMode.THELA,
          bagCount: 5,
          bhartii: 120,
          dharanCount: 2,
          looseKg: 15,
          ratePerMaund: 1600,
          bardanaQty: null,
          bardanaRate: null,
        },
      ],
      createdById: userId,
    });

    expect(invoice.status).toBe('POSTED');
    expect(Number(invoice.total)).toBe(76_430.42);

    const vouchers = invoice.vouchers.map((iv) => iv.voucher);
    expect(vouchers).toHaveLength(11);

    type VoucherRow = { debitId: number; creditId: number; amount: number };
    const pairs: VoucherRow[] = vouchers.map((v) => ({
      debitId: v.debitAccountId,
      creditId: v.creditAccountId,
      amount: Number(v.amount),
    }));

    expect(pairs).toEqual(
      expect.arrayContaining([
        { debitId: traderXId, creditId: partyAId, amount: 50_000 },
        { debitId: boriId, creditId: partyAId, amount: 100 },
        { debitId: partyAId, creditId: mazduriId, amount: 425 },
        { debitId: partyAId, creditId: brokerId, amount: 75 },
        { debitId: traderXId, creditId: partyBId, amount: 25_000 },
        { debitId: partyBId, creditId: mazduriId, amount: 212.5 },
        { debitId: partyBId, creditId: brokerId, amount: 37.5 },
        { debitId: traderXId, creditId: marketFeeId, amount: 30.42 },
        { debitId: traderXId, creditId: miscId, amount: 200 },
        { debitId: traderXId, creditId: commissionId, amount: 1200 },
        { debitId: traderXId, creditId: thelaId, amount: 50 },
      ]),
    );

    const totalAllLegs = pairs.reduce((s, v) => s + v.amount, 0);
    expect(totalAllLegs).toBe(77_330.42);

    for (const v of vouchers) {
      expect(v.type).toBe('KACHI_MAAL');
    }

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });
});
