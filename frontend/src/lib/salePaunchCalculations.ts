import { roundMoney } from './kachiMaalCalculations';

export {
  DHARAN_KG,
  MAUND_KG,
  parseNum,
  roundMoney,
} from './kachiMaalCalculations';

export const MAAL_KHATA_CATEGORIES = ['Maal Khata'] as const;
export const SALE_PARTY_CATEGORIES = ['Sale Party'] as const;

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

function roundWeightKg(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number.isInteger(n) ? n : roundMoney(n);
}

export function computeSalePaunchRow(
  input: SalePaunchRowInput,
  prefs: Pick<SalePaunchPreferenceRates, 'daamiPercent'>,
) {
  const totalWeightKg = roundWeightKg(
    input.bagCount * input.bhartii + input.dharanCount * 5 + input.looseKg,
  );
  const kaatKg = roundWeightKg(Math.max(0, input.kaatKg ?? 0));
  const netWeightKg = roundWeightKg(Math.max(0, totalWeightKg - kaatKg));
  const maunds = netWeightKg / 40;
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
) {
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

  const lowerBardanaAmount =
    options.lowerBardanaQty != null
    && options.lowerBardanaRate != null
    && options.lowerBardanaQty > 0
    && options.lowerBardanaRate > 0
      ? roundMoney(options.lowerBardanaQty * options.lowerBardanaRate)
      : null;
  const taxAmount = roundMoney(Math.max(0, options.taxAmount ?? 0));
  const biltyKirayaAmount = roundMoney(Math.max(0, options.biltyKirayaAmount ?? 0));
  const miscAmount = roundMoney(Math.max(0, options.miscAmount ?? 0));

  const upperNetTotal = roundMoney(totalNetUpperAmount + totalDammiAmount);
  const lowerNetTotal = roundMoney(
    totalLowerAmount
    + totalDammiAmount
    + totalRowBardanaAmount
    - (lowerBardanaAmount ?? 0)
    - taxAmount
    - biltyKirayaAmount
    - miscAmount,
  );
  const paunchRevenueDifference = roundMoney(lowerNetTotal - upperNetTotal);

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
