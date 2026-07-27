export const DHARAN_KG = 5;
export const MAUND_KG = 40;

export type SalePaunchPreferenceRates = {
  daamiPercent: number;
};

export type SalePaunchRowInput = {
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
  kaatKg?: number;
  upperRatePerMaund: number;
  lowerRatePerMaund: number;
  kanta?: number;
  bardanaQty?: number | null;
  bardanaRate?: number | null;
  dammiChecked?: boolean;
};

export type SalePaunchRowComputed = {
  totalWeightKg: number;
  kaatKg: number;
  netWeightKg: number;
  maunds: number;
  upperAmount: number;
  kanta: number;
  netUpperAmount: number;
  dammiAmount: number;
  lowerAmount: number;
  rowRevenue: number;
  bardanaAmount: number | null;
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundWeightKg(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number.isInteger(n) ? n : roundMoney(n);
}

export function computeSalePaunchRow(
  input: SalePaunchRowInput,
  prefs: Pick<SalePaunchPreferenceRates, 'daamiPercent'>,
): SalePaunchRowComputed {
  const totalWeightKg = roundWeightKg(
    input.bagCount * input.bhartii + input.dharanCount * DHARAN_KG + input.looseKg,
  );
  const kaatKg = roundWeightKg(Math.max(0, input.kaatKg ?? 0));
  const netWeightKg = roundWeightKg(Math.max(0, totalWeightKg - kaatKg));
  const maunds = netWeightKg / MAUND_KG;
  const upperAmount = roundMoney(maunds * input.upperRatePerMaund);
  const kanta = roundMoney(Math.max(0, input.kanta ?? 0));
  const netUpperAmount = roundMoney(Math.max(0, upperAmount - kanta));
  const dammiAmount = input.dammiChecked
    ? roundMoney(netUpperAmount * (prefs.daamiPercent / 100))
    : 0;
  const lowerAmount = roundMoney(maunds * input.lowerRatePerMaund);
  const rowRevenue = roundMoney(lowerAmount - upperAmount);

  const hasBardana =
    input.bardanaQty != null
    && input.bardanaRate != null
    && input.bardanaQty > 0
    && input.bardanaRate > 0;
  const bardanaAmount = hasBardana
    ? roundMoney(input.bardanaQty! * input.bardanaRate!)
    : null;

  return {
    totalWeightKg,
    kaatKg,
    netWeightKg,
    maunds,
    upperAmount,
    kanta,
    netUpperAmount,
    dammiAmount,
    lowerAmount,
    rowRevenue,
    bardanaAmount,
  };
}

export function computeLowerBardanaAmount(qty?: number | null, rate?: number | null) {
  if (qty == null || rate == null || qty <= 0 || rate <= 0) return null;
  return roundMoney(qty * rate);
}

export type SalePaunchInvoiceTotals = {
  totalWeightKg: number;
  totalKaatKg: number;
  totalNetWeightKg: number;
  totalUpperAmount: number;
  totalKanta: number;
  totalNetUpperAmount: number;
  totalLowerAmount: number;
  totalRowRevenue: number;
  totalDammiAmount: number;
  totalRowBardanaAmount: number;
  lowerBardanaAmount: number | null;
  /** Maal Khata credits (post-kanta) + commission credits — upper-side net. */
  upperNetTotal: number;
  /** Net owed by sale party after tax, bilty, and bardana; misc increases party debit. */
  lowerNetTotal: number;
  /** lowerNetTotal − upperNetTotal — single invoice-level revenue plug. */
  paunchRevenueDifference: number;
};

export function computeSalePaunchInvoiceTotals(
  rows: Array<{
    totalWeightKg: number;
    kaatKg: number;
    netWeightKg: number;
    upperAmount: number;
    kanta: number;
    netUpperAmount: number;
    lowerAmount: number;
    rowRevenue: number;
    dammiAmount: number;
    bardanaAmount: number | null;
  }>,
  options: {
    taxAmount?: number;
    biltyKirayaAmount?: number;
    miscAmount?: number;
    lowerBardanaQty?: number | null;
    lowerBardanaRate?: number | null;
  },
): SalePaunchInvoiceTotals {
  let totalWeightKg = 0;
  let totalKaatKg = 0;
  let totalNetWeightKg = 0;
  let totalUpperAmount = 0;
  let totalKanta = 0;
  let totalNetUpperAmount = 0;
  let totalLowerAmount = 0;
  let totalRowRevenue = 0;
  let totalDammiAmount = 0;
  let totalRowBardanaAmount = 0;

  for (const row of rows) {
    totalWeightKg += row.totalWeightKg;
    totalKaatKg += row.kaatKg;
    totalNetWeightKg += row.netWeightKg;
    totalUpperAmount += row.upperAmount;
    totalKanta += row.kanta;
    totalNetUpperAmount += row.netUpperAmount;
    totalLowerAmount += row.lowerAmount;
    totalRowRevenue += row.rowRevenue;
    totalDammiAmount += row.dammiAmount;
    totalRowBardanaAmount += row.bardanaAmount ?? 0;
  }

  totalWeightKg = roundWeightKg(totalWeightKg);
  totalKaatKg = roundWeightKg(totalKaatKg);
  totalNetWeightKg = roundWeightKg(totalNetWeightKg);
  totalUpperAmount = roundMoney(totalUpperAmount);
  totalKanta = roundMoney(totalKanta);
  totalNetUpperAmount = roundMoney(totalNetUpperAmount);
  totalLowerAmount = roundMoney(totalLowerAmount);
  totalRowRevenue = roundMoney(totalRowRevenue);
  totalDammiAmount = roundMoney(totalDammiAmount);
  totalRowBardanaAmount = roundMoney(totalRowBardanaAmount);

  const lowerBardanaAmount = computeLowerBardanaAmount(
    options.lowerBardanaQty,
    options.lowerBardanaRate,
  );
  const taxAmount = roundMoney(Math.max(0, options.taxAmount ?? 0));
  const biltyKirayaAmount = roundMoney(Math.max(0, options.biltyKirayaAmount ?? 0));
  const miscAmount = roundMoney(Math.max(0, options.miscAmount ?? 0));

  const upperNetTotal = roundMoney(totalNetUpperAmount + totalDammiAmount);

  const baseLowerNetTotal = roundMoney(
    totalLowerAmount
    + totalDammiAmount
    + totalRowBardanaAmount
    - (lowerBardanaAmount ?? 0)
    - taxAmount
    - biltyKirayaAmount,
  );
  const lowerNetTotal = roundMoney(baseLowerNetTotal + miscAmount);

  const paunchRevenueDifference = roundMoney(baseLowerNetTotal - upperNetTotal);

  return {
    totalWeightKg,
    totalKaatKg,
    totalNetWeightKg,
    totalUpperAmount,
    totalKanta,
    totalNetUpperAmount,
    totalLowerAmount,
    totalRowRevenue,
    totalDammiAmount,
    totalRowBardanaAmount,
    lowerBardanaAmount,
    upperNetTotal,
    lowerNetTotal,
    paunchRevenueDifference,
  };
}
