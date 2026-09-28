import { beforeAll, describe, expect, it } from 'vitest';
import { RecordStatus, VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { approveVoucher } from '../../test-helpers/approval';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import { getDailyReport } from '../reports/daily-report.service';
import {
  bootstrapChartOfAccounts,
  createVoucher,
  getAccountBalancesAsOf,
  getTrialBalance,
  listAccounts,
  listVouchers,
} from './accounting.service';

async function accountByName(name: string) {
  const accounts = await listAccounts();
  const account = accounts.find((a) => a.name === name);
  if (!account?.ledger) throw new Error(`Account not found: ${name}`);
  return account;
}

describe('report pagination + full-period totals', () => {
  let userId: number;
  let cashId: number;
  let expenseId: number;
  let voucherDate: string;
  let stamp: number;
  let expectedVoucherTotal: number;
  let financialYearId: number;

  beforeAll(async () => {
    stamp = Date.now();
    voucherDate = await voucherDateInActiveYear();
    await bootstrapChartOfAccounts();

    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    const fy = await prisma.financialYear.findFirst({ where: { status: 'ACTIVE' } });
    if (!fy) throw new Error('Active financial year required');
    financialYearId = fy.id;

    cashId = (await accountByName('Cash in Hand')).id;

    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    if (!expenseCat) throw new Error('Expenses category missing');
    const expense = await prisma.account.create({
      data: {
        categoryId: expenseCat.id,
        name: `Report Pag Expense ${stamp}`,
        code: `RPE-${stamp}`,
        type: 'EXPENSE',
        status: RecordStatus.ACTIVE,
      },
    });
    await prisma.ledger.create({ data: { accountId: expense.id, balance: 0 } });
    expenseId = expense.id;

    expectedVoucherTotal = 0;
    for (let i = 0; i < 35; i += 1) {
      const amount = 100 + i;
      expectedVoucherTotal += amount;
      const pending = await createVoucher({
        type: VoucherType.PAYMENT,
        debitAccountId: expenseId,
        creditAccountId: cashId,
        amount,
        date: voucherDate,
        reference: `RPAG-${stamp}-${i}`,
        createdById: userId,
      });
      await approveVoucher(pending.id);
    }

    // Extra accounts across two categories for balance packing checks.
    const bankCat = await prisma.accountCategory.findFirst({ where: { name: 'Bank' } });
    if (!bankCat) throw new Error('Bank category missing');
    for (let i = 0; i < 20; i += 1) {
      const a = await prisma.account.create({
        data: {
          categoryId: expenseCat.id,
          name: `RPAG Exp ${stamp}-${i}`,
          code: `RPX-${stamp}-${i}`,
          type: 'EXPENSE',
          status: RecordStatus.ACTIVE,
        },
      });
      await prisma.ledger.create({ data: { accountId: a.id, balance: 0 } });
    }
    for (let i = 0; i < 20; i += 1) {
      const a = await prisma.account.create({
        data: {
          categoryId: bankCat.id,
          name: `RPAG Bank ${stamp}-${i}`,
          code: `RPB-${stamp}-${i}`,
          type: 'ASSET',
          status: RecordStatus.ACTIVE,
        },
      });
      await prisma.ledger.create({ data: { accountId: a.id, balance: 0 } });
    }
  }, 180_000);

  it('vouchers page size 30 with full-period totals across pages', async () => {
    const page1 = await listVouchers(
      {
        fromDate: voucherDate,
        toDate: voucherDate,
        type: VoucherType.PAYMENT,
        financialYearId,
      },
      { limit: 30, offset: 0 },
    );
    const page2 = await listVouchers(
      {
        fromDate: voucherDate,
        toDate: voucherDate,
        type: VoucherType.PAYMENT,
        financialYearId,
      },
      { limit: 30, offset: 30 },
    );

    expect(page1.items.length).toBe(30);
    expect(page1.total).toBeGreaterThanOrEqual(35);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page1.totals.totalAmount).toBe(page2.totals.totalAmount);
    expect(page1.totals.byType.PAYMENT).toBe(page1.totals.totalAmount);

    const pageAmount = page1.items.reduce((s, v) => s + Number(v.amount), 0);
    expect(page1.totals.totalAmount).toBeGreaterThan(pageAmount);
    expect(page1.totals.totalAmount).toBeGreaterThanOrEqual(expectedVoucherTotal);
  });

  it('trial balance packs whole categories and keeps full totals when paginated', async () => {
    const full = await getTrialBalance(financialYearId, null);
    const page1 = await getTrialBalance(financialYearId, { limit: 30, offset: 0 });
    const page2 = await getTrialBalance(financialYearId, { limit: 30, offset: 30 });

    expect(full.total).toBeGreaterThan(30);
    expect(full.groups.length).toBeGreaterThan(1);
    expect(page1.accounts.length).toBeGreaterThan(0);
    expect(page2.accounts.length).toBeGreaterThan(0);
    expect(page1.pageCount).toBeGreaterThan(1);
    expect(page1.totalDebit).toBe(full.totalDebit);
    expect(page1.totalCredit).toBe(full.totalCredit);
    expect(page2.totalDebit).toBe(full.totalDebit);
    expect(page2.totalCredit).toBe(full.totalCredit);
    expect(page1.accounts[0]).toMatchObject({
      categoryId: expect.any(Number),
      categoryName: expect.any(String),
    });

    for (const group of page1.groups) {
      const fullGroup = full.groups.find((g) => g.categoryId === group.categoryId);
      expect(fullGroup).toBeTruthy();
      expect(group.accounts.length).toBe(fullGroup!.accounts.length);
    }
  });

  it('trial balance excludes hidden accounts from rows/groups but keeps them in totals', async () => {
    const before = await getTrialBalance(financialYearId, null);
    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    if (!expenseCat) throw new Error('Expenses category missing');

    const hidden = await prisma.account.create({
      data: {
        categoryId: expenseCat.id,
        name: `RPAG Hidden ${stamp}`,
        code: `RPH-${stamp}`,
        type: 'EXPENSE',
        status: RecordStatus.ACTIVE,
        isHidden: true,
      },
    });
    await prisma.ledger.create({ data: { accountId: hidden.id, balance: 12345 } });

    const tb = await getTrialBalance(financialYearId, null);
    expect(tb.accounts.some((a) => a.accountId === hidden.id)).toBe(false);
    expect(
      tb.groups.some((g) => g.accounts.some((a) => a.accountId === hidden.id)),
    ).toBe(false);
    expect(tb.totalDebit).toBe(before.totalDebit + 12345);
    expect(tb.totalCredit).toBe(before.totalCredit);
  });

  it('account balance packs whole categories and returns full grandBalance', async () => {
    const full = await getAccountBalancesAsOf({
      date: voucherDate,
      financialYearId,
      pagination: null,
    });
    const page1 = await getAccountBalancesAsOf({
      date: voucherDate,
      financialYearId,
      pagination: { limit: 30, offset: 0 },
    });
    const page2 = await getAccountBalancesAsOf({
      date: voucherDate,
      financialYearId,
      pagination: { limit: 30, offset: 30 },
    });

    expect(full.total).toBeGreaterThan(30);
    expect(page1.grandBalance).toBe(full.grandBalance);
    expect(page2.grandBalance).toBe(full.grandBalance);
    expect(page1.pageCount).toBeGreaterThan(1);

    for (const group of page1.groups) {
      const fullGroup = full.groups.find((g) => g.categoryId === group.categoryId);
      expect(fullGroup).toBeTruthy();
      expect(group.accounts.length).toBe(fullGroup!.accounts.length);
    }
  }, 60_000);

  it('daily report paginates with full filtered totals', async () => {
    const full = await getDailyReport(voucherDate, { pagination: null });
    const page1 = await getDailyReport(voucherDate, {
      filterKey: 'PAYMENT',
      pagination: { limit: 30, offset: 0 },
    });
    const page2 = await getDailyReport(voucherDate, {
      filterKey: 'PAYMENT',
      pagination: { limit: 30, offset: 30 },
    });

    expect(page1.rows.length).toBe(30);
    expect(page1.total).toBeGreaterThanOrEqual(35);
    expect(page2.rows.length).toBeGreaterThan(0);
    expect(page1.filteredTotals.count).toBe(page2.filteredTotals.count);
    expect(page1.filteredTotals.amount).toBe(page2.filteredTotals.amount);
    expect(page1.filteredTotals.count).toBe(
      full.rows.filter((r) => r.filterKey === 'PAYMENT').length,
    );
  });

  it('listVouchers excludes invoice-generated voucher types from All and type filters', async () => {
    const invoiceVoucher = await prisma.voucher.create({
      data: {
        type: VoucherType.KACHI,
        number: 90_000 + (stamp % 1000),
        date: new Date(`${voucherDate}T12:00:00.000Z`),
        amount: 999_999,
        reference: `RPAG-KACHI-${stamp}`,
        description: 'Invoice posting must stay off vouchers report',
        status: 'ACTIVE',
        createdById: userId,
        financialYearId,
      },
    });

    try {
      const all = await listVouchers(
        { fromDate: voucherDate, toDate: voucherDate, financialYearId },
        { limit: 500, offset: 0 },
      );
      expect(all.items.every((v) => ['PAYMENT', 'RECEIPT', 'JOURNAL'].includes(v.type))).toBe(true);
      expect(all.items.some((v) => v.id === invoiceVoucher.id)).toBe(false);
      expect(all.totals.byType).toEqual({
        PAYMENT: expect.any(Number),
        RECEIPT: expect.any(Number),
        JOURNAL: expect.any(Number),
      });
      expect('KACHI' in all.totals.byType).toBe(false);

      const byInvoiceType = await listVouchers(
        {
          fromDate: voucherDate,
          toDate: voucherDate,
          type: VoucherType.KACHI,
          financialYearId,
        },
        { limit: 50, offset: 0 },
      );
      expect(byInvoiceType.items).toEqual([]);
      expect(byInvoiceType.total).toBe(0);
      expect(byInvoiceType.totals.totalAmount).toBe(0);
    } finally {
      await prisma.voucher.delete({ where: { id: invoiceVoucher.id } });
    }
  });
});
