import { describe, expect, it } from 'vitest';
import {
  combinedGeneralGoodsLineDescription,
  formatLineSnippet,
  generalPurchaseApprovalDescription,
  generalSaleApprovalDescription,
} from '../invoices/general-goods-descriptions';
import { invoiceApprovalDescription } from './approval-display';

describe('general-goods-descriptions', () => {
  it('formats a single line snippet', () => {
    expect(formatLineSnippet('Urea', 5, 4500)).toBe('Urea 5@4500');
  });

  it('joins combined line descriptions', () => {
    expect(
      combinedGeneralGoodsLineDescription([
        { productName: 'Urea', quantity: 5, rate: 4500 },
        { productName: 'DAP', quantity: 3, rate: 6200 },
      ]),
    ).toBe('Urea 5@4500; DAP 3@6200');
  });

  it('builds purchase and sale approval descriptions with party', () => {
    const lines = [
      { productName: 'Urea', quantity: 5, rate: 4500 },
      { productName: 'DAP', quantity: 3, rate: 6200 },
    ];
    expect(generalPurchaseApprovalDescription(lines, 'Supplier A')).toBe(
      'Purchase: Urea 5@4500; DAP 3@6200 from Supplier A',
    );
    expect(generalSaleApprovalDescription([{ productName: 'Fert X', quantity: 10, rate: 800 }], 'Customer B')).toBe(
      'Sale: Fert X 10@800 to Customer B',
    );
  });
});

describe('invoiceApprovalDescription', () => {
  it('uses general goods helpers for PURCHASE_GENERAL / SALE_GENERAL', () => {
    expect(
      invoiceApprovalDescription({
        type: 'PURCHASE_GENERAL',
        partyAccount: { name: 'GG Supplier' },
        generalPurchaseLines: [
          { quantity: 2, rate: 100, product: { name: 'Bag' } },
        ],
      }),
    ).toBe('Purchase: Bag 2@100 from GG Supplier');

    expect(
      invoiceApprovalDescription({
        type: 'SALE_GENERAL',
        salePartyAccount: { name: 'GG Customer' },
        generalSaleLines: [
          { quantity: 1, rate: 200, product: { name: 'Bottle' } },
        ],
      }),
    ).toBe('Sale: Bottle 1@200 to GG Customer');
  });

  it('falls back to tafseel for other invoice types', () => {
    expect(
      invoiceApprovalDescription({
        type: 'PURCHASE_MAAL',
        tafseel: 'Wheat load',
        notes: 'ignored when tafseel set',
      }),
    ).toBe('Wheat load');
  });
});
