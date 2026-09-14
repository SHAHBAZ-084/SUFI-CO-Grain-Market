import { describe, expect, it } from 'vitest';
import {
  computeRawStockInKg,
  computeStockInFromRow,
  computeStockOutBags,
  STOCK_DHARAN_KG,
} from './stock.calculations';

describe('stock.calculations', () => {
  it('adds whole bags and converts loose + remainder via bhartii', () => {
    const first = computeStockInFromRow({
      wholeBags: 10,
      dharanCount: 2, // 10 kg
      looseKg: 5,
      bhartii: 20,
      carriedRemainderKg: 0,
    });
    // loose 15 → 0 full bags, remainder 15; bagsIn = 10
    expect(first.bagsIn).toBe(10);
    expect(first.newRemainderKg).toBe(15);

    const second = computeStockInFromRow({
      wholeBags: 0,
      dharanCount: 0,
      looseKg: 6,
      bhartii: 20,
      carriedRemainderKg: first.newRemainderKg,
    });
    // 15+6=21 → 1 bag, remainder 1
    expect(second.newFullBagsFromLoose).toBe(1);
    expect(second.bagsIn).toBe(1);
    expect(second.newRemainderKg).toBe(1);
  });

  it('computes raw stock-in kg independently of bag bucketing', () => {
    // 10 bags × 40 bhartii + 1 dharan × 5 + 12.5 loose = 417.5
    expect(
      computeRawStockInKg({
        wholeBags: 10,
        bhartii: 40,
        dharanCount: 1,
        looseKg: 12.5,
      }),
    ).toBe(10 * 40 + 1 * STOCK_DHARAN_KG + 12.5);

    // Bag bucketing would roll loose into extra bags + remainder; raw kg must stay full arrival weight.
    const bucketed = computeStockInFromRow({
      wholeBags: 10,
      dharanCount: 1,
      looseKg: 12.5,
      bhartii: 40,
      carriedRemainderKg: 0,
    });
    expect(bucketed.bagsIn).toBe(10); // 17.5 loose < 40 → no extra bag
    expect(bucketed.newRemainderKg).toBe(17.5);
    expect(
      computeRawStockInKg({
        wholeBags: 10,
        bhartii: 40,
        dharanCount: 1,
        looseKg: 12.5,
      }),
    ).toBe(417.5);
  });

  it('counts Sale Paunch OUT from the selected bag mode only', () => {
    expect(computeStockOutBags(12, 0, 'BORI')).toBe(12);
    expect(computeStockOutBags(0, 40, 'THELA')).toBe(40);
    expect(computeStockOutBags(12, 40, 'BORI')).toBe(12);
  });
});
