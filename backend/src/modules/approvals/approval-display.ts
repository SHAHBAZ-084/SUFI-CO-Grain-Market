import {
  InvoiceType,
  OpeningBalanceSide,
  VoucherType,
} from '@prisma/client';
import { OPENING_BALANCE_EQUITY_ACCOUNT_NAME } from '../accounting/accounting.service';
import {
  generalPurchaseApprovalDescription,
  generalSaleApprovalDescription,
  type GeneralGoodsLineDescInput,
} from '../invoices/general-goods-descriptions';
import type { ApprovalKind } from './approval-types';

export type ApprovalAccountRef = {
  name: string;
  code: string;
};

const EQUITY_REF: ApprovalAccountRef = {
  name: OPENING_BALANCE_EQUITY_ACCOUNT_NAME,
  code: '',
};

const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  SALE_COMMISSION: 'Sale on Commission',
  SALE_PAUNCH: 'Sale on Paunch',
  PURCHASE_MAAL: 'Purchase to Maal',
  KACHI_MAAL: 'Kachi Maal',
  PURCHASE_GENERAL: 'Purchase Invoice (General)',
  SALE_GENERAL: 'Sale Invoice (General)',
};

const SALE_INVOICE_TYPES: InvoiceType[] = ['SALE_COMMISSION', 'SALE_PAUNCH', 'SALE_GENERAL'];
const PURCHASE_INVOICE_TYPES: InvoiceType[] = ['PURCHASE_MAAL', 'KACHI_MAAL', 'PURCHASE_GENERAL'];

const MULTI_LEG_VOUCHER_TYPES: VoucherType[] = [
  'KACHI',
  'PURCHASE_MAAL',
  'SALE_PAUNCH',
  'SALE_COMMISSION',
  'PURCHASE_GENERAL',
  'SALE_GENERAL',
];

function accountRef(name: string, code: string): ApprovalAccountRef {
  return { name, code };
}

function sideAccounts(
  side: OpeningBalanceSide,
  primary: ApprovalAccountRef,
  amount: number,
): { debitAccount: ApprovalAccountRef | null; creditAccount: ApprovalAccountRef | null } {
  if (!(amount > 0)) {
    return { debitAccount: primary, creditAccount: null };
  }
  if (side === 'DR') {
    return { debitAccount: primary, creditAccount: EQUITY_REF };
  }
  return { debitAccount: EQUITY_REF, creditAccount: primary };
}

function voucherBaseTypeLabel(type: VoucherType): string {
  switch (type) {
    case 'PAYMENT':
      return 'Payment';
    case 'RECEIPT':
      return 'Receipt';
    case 'JOURNAL':
      return 'Journal';
    case 'KACHI':
      return 'Kachi';
    case 'PURCHASE_MAAL':
      return 'Purchase Maal';
    case 'SALE_PAUNCH':
      return 'Sale Paunch';
    case 'SALE_COMMISSION':
      return 'Sale Commission';
    case 'PURCHASE_GENERAL':
      return 'Purchase General';
    case 'SALE_GENERAL':
      return 'Sale General';
    default:
      return type;
  }
}

export function voucherApprovalTypeLabel(voucher: {
  type: VoucherType;
  invoiceLink?: { invoice?: { type: InvoiceType } | null } | null;
}): string {
  const base = voucherBaseTypeLabel(voucher.type);
  const invoiceType = voucher.invoiceLink?.invoice?.type;
  if (invoiceType && SALE_INVOICE_TYPES.includes(invoiceType) && voucher.type === 'RECEIPT') {
    return 'Receipt (Sale)';
  }
  if (invoiceType && PURCHASE_INVOICE_TYPES.includes(invoiceType) && voucher.type === 'PAYMENT') {
    return 'Payment (Purchase)';
  }
  return base;
}

export function voucherApprovalAccounts(voucher: {
  type: VoucherType;
  debitAccount?: { name: string; code: string } | null;
  creditAccount?: { name: string; code: string } | null;
}): { debitAccount: ApprovalAccountRef | null; creditAccount: ApprovalAccountRef | null } {
  if (MULTI_LEG_VOUCHER_TYPES.includes(voucher.type)) {
    return { debitAccount: null, creditAccount: null };
  }
  return {
    debitAccount: voucher.debitAccount
      ? accountRef(voucher.debitAccount.name, voucher.debitAccount.code)
      : null,
    creditAccount: voucher.creditAccount
      ? accountRef(voucher.creditAccount.name, voucher.creditAccount.code)
      : null,
  };
}

export function kindDisplayLabel(kind: ApprovalKind): string {
  switch (kind) {
    case 'account':
      return 'Account';
    case 'product':
      return 'Product';
    case 'voucher':
      return 'Voucher';
    case 'invoice':
      return 'Invoice';
    case 'account-adjustment':
      return 'Acct Adj.';
    case 'stock-adjustment':
      return 'Stock Adj.';
    default:
      return kind;
  }
}

export function invoiceTypeLabel(type: InvoiceType): string {
  return INVOICE_TYPE_LABELS[type] ?? type;
}

/** Display names for General Goods system accounts (must match ensureGeneralGoodsAccounts). */
export const GENERAL_GOODS_MAZDURI_ACCOUNT_NAME = 'General Goods Mazduri';
export const GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME = 'General Goods Sale Revenue';

function joinApprovalAccounts(refs: ApprovalAccountRef[]): ApprovalAccountRef | null {
  const cleaned = refs.filter((ref) => ref.name.trim());
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  // Embed codes in the joined label — single code field cannot represent multiple legs.
  return {
    name: cleaned
      .map((ref) => (ref.code ? `${ref.name} (${ref.code})` : ref.name))
      .join('; '),
    code: '',
  };
}

type ProductAccountLine = {
  quantity?: unknown;
  rate?: unknown;
  mazduriAmount?: unknown;
  unitCost?: unknown;
  product?: {
    name?: string | null;
    code?: string | null;
    account?: { name: string; code: string } | null;
  } | null;
};

function productLedgerRef(line: ProductAccountLine): ApprovalAccountRef | null {
  const account = line.product?.account;
  if (account?.name) return accountRef(account.name, account.code);
  if (line.product?.name) return accountRef(line.product.name, line.product.code ?? '');
  return null;
}

/**
 * Debit/credit preview for Pending Approvals.
 * Grain invoices use invoice.debitAccount + invoice.product.account.
 * General Goods preview the real multi-leg posting (product ↔ party ± mazduri/revenue).
 */
export function invoiceApprovalAccounts(invoice: {
  type: InvoiceType;
  debitAccount?: { name: string; code: string } | null;
  product?: {
    name: string;
    code: string;
    account?: { name: string; code: string } | null;
  } | null;
  partyAccount?: { name: string; code: string } | null;
  salePartyAccount?: { name: string; code: string } | null;
  generalPurchaseLines?: Array<ProductAccountLine>;
  generalSaleLines?: Array<ProductAccountLine>;
}): { debitAccount: ApprovalAccountRef | null; creditAccount: ApprovalAccountRef | null } {
  if (invoice.type === 'PURCHASE_GENERAL') {
    const lines = invoice.generalPurchaseLines ?? [];
    const debitRefs = lines
      .map((line) => productLedgerRef(line))
      .filter((ref): ref is ApprovalAccountRef => ref != null);
    const creditRefs: ApprovalAccountRef[] = [];
    if (invoice.partyAccount) {
      creditRefs.push(accountRef(invoice.partyAccount.name, invoice.partyAccount.code));
    }
    const mazduriTotal = lines.reduce((sum, line) => sum + Math.max(0, Number(line.mazduriAmount ?? 0)), 0);
    if (mazduriTotal > 0) {
      creditRefs.push(accountRef(GENERAL_GOODS_MAZDURI_ACCOUNT_NAME, 'GG-MAZ'));
    }
    return {
      debitAccount: joinApprovalAccounts(debitRefs),
      creditAccount: joinApprovalAccounts(creditRefs),
    };
  }

  if (invoice.type === 'SALE_GENERAL') {
    const lines = invoice.generalSaleLines ?? [];
    const debitRefs: ApprovalAccountRef[] = [];
    if (invoice.salePartyAccount) {
      debitRefs.push(accountRef(invoice.salePartyAccount.name, invoice.salePartyAccount.code));
    }
    const creditRefs: ApprovalAccountRef[] = [];
    let hasProfit = false;
    let hasLoss = false;
    for (const line of lines) {
      const qty = Number(line.quantity ?? 0);
      const rate = Number(line.rate ?? 0);
      const unitCost = Math.max(0, Number(line.unitCost ?? 0));
      const lineTotal = qty * rate;
      const costAmount = qty * unitCost;
      const profitAmount = lineTotal - costAmount;
      if (costAmount > 0) {
        const productRef = productLedgerRef(line);
        if (productRef) creditRefs.push(productRef);
      }
      if (profitAmount > 0) hasProfit = true;
      if (profitAmount < 0) hasLoss = true;
    }
    if (hasProfit) {
      creditRefs.push(accountRef(GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME, 'GG-PREV'));
    }
    if (hasLoss) {
      debitRefs.push(accountRef(GENERAL_GOODS_SALE_REVENUE_ACCOUNT_NAME, 'GG-PREV'));
    }
    return {
      debitAccount: joinApprovalAccounts(debitRefs),
      creditAccount: joinApprovalAccounts(creditRefs),
    };
  }

  return {
    debitAccount: invoice.debitAccount
      ? accountRef(invoice.debitAccount.name, invoice.debitAccount.code)
      : null,
    creditAccount: invoice.product?.account
      ? accountRef(invoice.product.account.name, invoice.product.account.code)
      : invoice.product
        ? accountRef(invoice.product.name, invoice.product.code)
        : null,
  };
}

/** Readable pending-approval description for General Goods invoices (else tafseel/notes). */
export function invoiceApprovalDescription(invoice: {
  type: InvoiceType;
  tafseel?: string | null;
  notes?: string | null;
  partyAccount?: { name: string } | null;
  salePartyAccount?: { name: string } | null;
  generalPurchaseLines?: Array<{
    quantity: unknown;
    rate: unknown;
    product?: { name: string } | null;
  }>;
  generalSaleLines?: Array<{
    quantity: unknown;
    rate: unknown;
    product?: { name: string } | null;
  }>;
}): string | null {
  if (invoice.type === 'PURCHASE_GENERAL') {
    const lines: GeneralGoodsLineDescInput[] = (invoice.generalPurchaseLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    return generalPurchaseApprovalDescription(lines, invoice.partyAccount?.name);
  }
  if (invoice.type === 'SALE_GENERAL') {
    const lines: GeneralGoodsLineDescInput[] = (invoice.generalSaleLines ?? [])
      .filter((line) => line.product?.name)
      .map((line) => ({
        productName: line.product!.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
      }));
    return generalSaleApprovalDescription(lines, invoice.salePartyAccount?.name);
  }
  return invoice.tafseel ?? invoice.notes ?? null;
}

export { accountRef, sideAccounts };
