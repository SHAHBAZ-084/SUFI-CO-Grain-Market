import { describe, expect, it } from 'vitest';
import {
  invoiceTypeLabel,
  sideAccounts,
  voucherApprovalAccounts,
  voucherApprovalTypeLabel,
} from './approval-display';

describe('approval-display', () => {
  it('labels receipt linked to sale invoice', () => {
    expect(
      voucherApprovalTypeLabel({
        type: 'RECEIPT',
        invoiceLink: { invoice: { type: 'SALE_COMMISSION' } },
      }),
    ).toBe('Receipt (Sale)');
  });

  it('labels payment linked to purchase invoice', () => {
    expect(
      voucherApprovalTypeLabel({
        type: 'PAYMENT',
        invoiceLink: { invoice: { type: 'PURCHASE_MAAL' } },
      }),
    ).toBe('Payment (Purchase)');
  });

  it('maps debit and credit accounts for standard voucher', () => {
    const accounts = voucherApprovalAccounts({
      type: 'PAYMENT',
      debitAccount: { name: 'Expense', code: 'EXP-1' },
      creditAccount: { name: 'Cash', code: '1' },
    });
    expect(accounts.debitAccount?.name).toBe('Expense');
    expect(accounts.creditAccount?.name).toBe('Cash');
  });

  it('places opening balance on debit side', () => {
    const { debitAccount, creditAccount } = sideAccounts(
      'DR',
      { name: 'Cash in Hand', code: '1' },
      5000,
    );
    expect(debitAccount?.name).toBe('Cash in Hand');
    expect(creditAccount?.name).toBe('Opening Balance Equity');
  });

  it('formats invoice type labels', () => {
    expect(invoiceTypeLabel('KACHI_MAAL')).toBe('Kachi Maal');
  });
});
