import {
  InvoiceType,
  OpeningBalanceSide,
  VoucherType,
} from '@prisma/client';
import { OPENING_BALANCE_EQUITY_ACCOUNT_NAME } from '../accounting/accounting.service';
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
};

const SALE_INVOICE_TYPES: InvoiceType[] = ['SALE_COMMISSION', 'SALE_PAUNCH'];
const PURCHASE_INVOICE_TYPES: InvoiceType[] = ['PURCHASE_MAAL', 'KACHI_MAAL'];

const MULTI_LEG_VOUCHER_TYPES: VoucherType[] = [
  'KACHI',
  'PURCHASE_MAAL',
  'SALE_PAUNCH',
  'SALE_COMMISSION',
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

export { accountRef, sideAccounts };
