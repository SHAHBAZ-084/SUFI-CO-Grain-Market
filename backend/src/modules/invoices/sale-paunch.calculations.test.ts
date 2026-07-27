import { describe, expect, it } from 'vitest';
import {
  computeSalePaunchInvoiceTotals,
  computeSalePaunchRow,
} from './sale-paunch.calculations';

describe('sale-paunch.calculations', () => {
  const prefs = { daamiPercent: 1.6 };

  it('computes row amounts with kanta deducted from Maal Khata credit only', () => {
    const row = computeSalePaunchRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        upperRatePerMaund: 2000,
        lowerRatePerMaund: 2500,
        kanta: 400,
      },
      prefs,
    );

    expect(row.totalWeightKg).toBe(1000);
    expect(row.netWeightKg).toBe(1000);
    expect(row.upperAmount).toBe(50_000);
    expect(row.netUpperAmount).toBe(49_600);
    expect(row.lowerAmount).toBe(62_500);
    expect(row.rowRevenue).toBe(12_500);
  });

  it('applies per-row kaat kg before both upper and lower rates', () => {
    const row = computeSalePaunchRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        kaatKg: 50,
        upperRatePerMaund: 2000,
        lowerRatePerMaund: 2500,
        kanta: 400,
      },
      prefs,
    );

    expect(row.totalWeightKg).toBe(1000);
    expect(row.kaatKg).toBe(50);
    expect(row.netWeightKg).toBe(950);
    expect(row.upperAmount).toBe(47_500);
    expect(row.netUpperAmount).toBe(47_100);
    expect(row.lowerAmount).toBe(59_375);
    expect(row.rowRevenue).toBe(11_875);
  });

  it('computes invoice-level revenue plug from lower and upper net totals', () => {
    const row = computeSalePaunchRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        upperRatePerMaund: 2000,
        lowerRatePerMaund: 2500,
        kanta: 400,
        dammiChecked: true,
      },
      prefs,
    );
    const totals = computeSalePaunchInvoiceTotals([row], {});

    expect(totals.upperNetTotal).toBe(50_393.6);
    expect(totals.lowerNetTotal).toBe(63_293.6);
    expect(totals.paunchRevenueDifference).toBe(12_900);
    expect(totals.upperNetTotal + totals.paunchRevenueDifference).toBe(totals.lowerNetTotal);
  });

  it('reduces both sides when kaat is entered per row', () => {
    const row = computeSalePaunchRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        kaatKg: 50,
        upperRatePerMaund: 2000,
        lowerRatePerMaund: 2500,
        kanta: 400,
        dammiChecked: true,
      },
      prefs,
    );
    const totals = computeSalePaunchInvoiceTotals([row], {});

    expect(totals.totalKaatKg).toBe(50);
    expect(totals.upperNetTotal).toBe(47_853.6);
    expect(totals.lowerNetTotal).toBe(60_128.6);
    expect(totals.paunchRevenueDifference).toBe(12_275);
  });

  it('adds misc to sale party debit like Kachi Maal (opposite of tax and bilty)', () => {
    const row = computeSalePaunchRow(
      {
        bagCount: 10,
        bhartii: 100,
        dharanCount: 0,
        looseKg: 0,
        upperRatePerMaund: 2000,
        lowerRatePerMaund: 2500,
        kanta: 400,
        dammiChecked: true,
      },
      prefs,
    );
    const withoutMisc = computeSalePaunchInvoiceTotals([row], {});
    const withMisc = computeSalePaunchInvoiceTotals([row], { miscAmount: 200 });
    const withTax = computeSalePaunchInvoiceTotals([row], { taxAmount: 200 });

    expect(withMisc.lowerNetTotal).toBe(withoutMisc.lowerNetTotal + 200);
    expect(withTax.lowerNetTotal).toBe(withoutMisc.lowerNetTotal - 200);
    expect(withMisc.paunchRevenueDifference).toBe(withoutMisc.paunchRevenueDifference);
  });
});
