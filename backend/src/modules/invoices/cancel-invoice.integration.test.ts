import { AccountType, BoriThelaMode, InvoiceStatus, RecordStatus, VoucherType } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { voucherDateInActiveYear } from '../../test-helpers/financial-year';
import { approveInvoice, approveProduct, approveVoucher, loadInvoiceWithVouchers } from '../../test-helpers/approval';
import {
  cancelVoucher,
  createVoucher,
  ensureSalePaunchAccounts,
  getTrialBalance,
  KACHI_MAAL_CATEGORY_NAMES,
} from '../accounting/accounting.service';
import { createProduct, MAAL_KHATA_CATEGORY_NAME } from '../products/products.service';
import { getEmptyBardanaReport } from '../inventory/bardana.service';
import { getProductStockBalances } from '../stock/stock.service';
import { cancelInvoice } from './cancel-invoice.service';
import { createPurchaseMaalInvoice } from './purchase-maal.service';
import { createSalePaunchInvoice } from './sale-paunch.service';
import { createKachiMaalInvoice } from './kachi-maal.service';

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
      data: { categoryId: category.id, name: accountName, code, type, status: RecordStatus.ACTIVE },
      include: { ledger: true },
    });
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  } else if (!account.ledger) {
    await prisma.ledger.create({ data: { accountId: account.id, balance: 0 } });
  }
  return account;
}

describe('cancelInvoice + post-delete lock safety', () => {
  let userId: number;
  let invoiceDate: string;
  let salePartyId: number;
  let purchasePartyId: number;
  let cashId: number;
  let productId: number;
  let maalKhataId: number;

  beforeAll(async () => {
    invoiceDate = await voucherDateInActiveYear();
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    await prisma.$transaction(async (tx) => {
      await ensureSalePaunchAccounts(tx);
    });

    salePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY,
        'Cancel Test Sale Party',
        AccountType.ASSET,
        `CANCEL-SP-${Date.now()}`,
      )
    ).id;

    purchasePartyId = (
      await ensureAccountInCategory(
        KACHI_MAAL_CATEGORY_NAMES.EXT_PURCHASE,
        'Cancel Test Purchase Party',
        AccountType.LIABILITY,
        `CANCEL-PP-${Date.now()}`,
      )
    ).id;

    const cashCat = await prisma.accountCategory.findFirst({
      where: { isActive: true, name: { contains: 'Cash' } },
    });
    if (!cashCat) throw new Error('Cash category missing');
    const cash = await prisma.account.findFirst({
      where: { isActive: true, categoryId: cashCat.id, status: RecordStatus.ACTIVE },
    });
    if (!cash) throw new Error('Cash account missing');
    cashId = cash.id;

    const product = await createProduct({ name: `Cancel Stock Wheat ${Date.now()}` });
    await approveProduct(product.id);
    const category = await prisma.accountCategory.findUnique({
      where: { id: product.account.categoryId },
    });
    expect(category?.name).toBe(MAAL_KHATA_CATEGORY_NAME);
    productId = product.id;
    maalKhataId = product.accountId;

    // Seed stock so Sale Paunch has bags to sell.
    const seed = await createPurchaseMaalInvoice({
      invoiceDate,
      billNo: `CANCEL-SEED-${Date.now()}`,
      productId,
      marketFeeEnabled: false,
      mazduriEnabled: false,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 50,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(seed.id);
  });

  it('cancels Purchase Maal and restores stock/remainder to prior values', async () => {
    const beforeBalances = await getProductStockBalances();
    const before = beforeBalances.find((b) => b.productId === productId) ?? {
      bori: 0,
      thela: 0,
      kg: 0,
    };
    const beforeRemainder = await prisma.stockRemainder.findUnique({
      where: { productId_bagType: { productId, bagType: 'BORI' } },
    });

    const pending = await createPurchaseMaalInvoice({
      invoiceDate,
      billNo: `CANCEL-PM-${Date.now()}`,
      productId,
      marketFeeEnabled: false,
      mazduriEnabled: false,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 5,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 25,
          ratePerMaund: 2000,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(pending.id);
    const posted = await loadInvoiceWithVouchers(pending.id);

    await cancelInvoice(posted.id, userId);

    const cancelled = await prisma.invoice.findUniqueOrThrow({ where: { id: posted.id } });
    expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);
    expect(await prisma.stockMovement.count({ where: { invoiceId: posted.id } })).toBe(0);

    const afterBalances = await getProductStockBalances();
    const after = afterBalances.find((b) => b.productId === productId) ?? {
      bori: 0,
      thela: 0,
      kg: 0,
    };
    expect(after.bori).toBe(before.bori);
    expect(after.kg).toBe(before.kg);

    const afterRemainder = await prisma.stockRemainder.findUnique({
      where: { productId_bagType: { productId, bagType: 'BORI' } },
    });
    expect(Number(afterRemainder?.remainderKg ?? 0)).toBe(Number(beforeRemainder?.remainderKg ?? 0));

    const voucher = posted.vouchers[0]?.voucher;
    if (voucher) {
      const v = await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } });
      expect(v.status).toBe('CANCELLED');
    }

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });

  it('cancels Sale Paunch and restores stock + empty bardana', async () => {
    const beforeStock = (await getProductStockBalances()).find((b) => b.productId === productId) ?? {
      bori: 0,
      thela: 0,
      kg: 0,
    };
    const beforeBardana = await getEmptyBardanaReport();
    const beforeBori =
      beforeBardana.balances.find((b) => b.bagType === 'BORI')?.balance ?? 0;

    const pending = await createSalePaunchInvoice({
      invoiceDate,
      salePartyAccountId: salePartyId,
      billNo: `CANCEL-SP-${Date.now()}`,
      lines: [
        {
          maalKhataAccountId: maalKhataId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 3,
          thelaCount: 0,
          compWeightKg: 300,
          upperRatePerMaund: 2000,
          lowerRatePerMaund: 2500,
          kanta: 100,
          dammiChecked: false,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(pending.id);
    const posted = await loadInvoiceWithVouchers(pending.id);

    await cancelInvoice(posted.id, userId);

    expect(await prisma.stockMovement.count({ where: { invoiceId: posted.id } })).toBe(0);
    expect(await prisma.emptyBardanaMovement.count({ where: { invoiceId: posted.id } })).toBe(0);

    const afterStock = (await getProductStockBalances()).find((b) => b.productId === productId) ?? {
      bori: 0,
      thela: 0,
      kg: 0,
    };
    expect(afterStock.bori).toBe(beforeStock.bori);
    expect(afterStock.kg).toBe(beforeStock.kg);

    const afterBardana = await getEmptyBardanaReport();
    const afterBori = afterBardana.balances.find((b) => b.bagType === 'BORI')?.balance ?? 0;
    expect(afterBori).toBe(beforeBori);

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });

  it('cancels Kachi Maal (ledger only) and refuses orphan voucher cancel while linked', async () => {
    const pending = await createKachiMaalInvoice({
      invoiceDate,
      billNo: `CANCEL-KM-${Date.now()}`,
      debitAccountId: salePartyId,
      miscAmount: 0,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 2,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 3000,
          bardanaQty: null,
          bardanaRate: null,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(pending.id);
    const posted = await loadInvoiceWithVouchers(pending.id);
    const voucherId = posted.vouchers[0]?.voucher.id;
    expect(voucherId).toBeTruthy();

    await expect(cancelVoucher(voucherId!, userId)).rejects.toThrow(/Delete the invoice instead/);

    await cancelInvoice(posted.id, userId);
    const cancelled = await prisma.invoice.findUniqueOrThrow({ where: { id: posted.id } });
    expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);
    const voucher = await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId! } });
    expect(voucher.status).toBe('CANCELLED');
  });

  it('cancels a plain voucher then still creates invoices without lock errors', async () => {
    const pendingVoucher = await createVoucher({
      type: VoucherType.PAYMENT,
      amount: 100,
      date: invoiceDate,
      debitAccountId: purchasePartyId,
      creditAccountId: cashId,
      description: 'Cancel-lock probe',
      reference: `CANCEL-LOCK-${Date.now()}`,
      createdById: userId,
    });
    const voucher =
      pendingVoucher.status === 'PENDING_APPROVAL'
        ? await approveVoucher(pendingVoucher.id)
        : pendingVoucher;

    await cancelVoucher(voucher.id, userId);

    const a = await createPurchaseMaalInvoice({
      invoiceDate,
      billNo: `CANCEL-AFTER-V-${Date.now()}`,
      productId,
      marketFeeEnabled: false,
      mazduriEnabled: false,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 1,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(a.id);
    await cancelInvoice(a.id, userId);

    const b = await createPurchaseMaalInvoice({
      invoiceDate,
      billNo: `CANCEL-AFTER-V2-${Date.now()}`,
      productId,
      marketFeeEnabled: false,
      mazduriEnabled: false,
      lowerBardanaMode: null,
      lowerBardanaQty: null,
      lowerBardanaRate: null,
      lines: [
        {
          partyAccountId: purchasePartyId,
          boriOrThelaMode: BoriThelaMode.BORI,
          bagCount: 1,
          bhartii: 100,
          dharanCount: 0,
          looseKg: 0,
          ratePerMaund: 2000,
        },
      ],
      createdById: userId,
    });
    await approveInvoice(b.id);
    await cancelInvoice(b.id, userId);

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });

  it('runs two invoice deletes back to back without lock errors', async () => {
    const make = async (tag: string) => {
      const pending = await createPurchaseMaalInvoice({
        invoiceDate,
        billNo: `CANCEL-BB-${tag}-${Date.now()}`,
        productId,
        marketFeeEnabled: false,
        mazduriEnabled: false,
        lowerBardanaMode: null,
        lowerBardanaQty: null,
        lowerBardanaRate: null,
        lines: [
          {
            partyAccountId: purchasePartyId,
            boriOrThelaMode: BoriThelaMode.BORI,
            bagCount: 1,
            bhartii: 100,
            dharanCount: 0,
            looseKg: 0,
            ratePerMaund: 2000,
          },
        ],
        createdById: userId,
      });
      await approveInvoice(pending.id);
      return pending.id;
    };

    const id1 = await make('1');
    const id2 = await make('2');
    await cancelInvoice(id1, userId);
    await cancelInvoice(id2, userId);

    const tb = await getTrialBalance();
    expect(tb.isBalanced).toBe(true);
  });
});
