import {
  BoriThelaMode,
  InvoiceType,
  Prisma,
  StockBagType,
  StockDirection,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { USER_VISIBLE_PRODUCT_STATUS } from '../approvals/record-status';
import { isMaalKhataCategoryName } from '../products/maal-khata';
import {
  STOCK_TRACKING_STARTED_AT,
  bagTypeFromMode,
  computeRawStockInKg,
  computeStockInFromRow,
  computeStockOutBags,
  type StockBagKind,
} from './stock.calculations';

type Tx = Prisma.TransactionClient;

function toStockBagType(kind: StockBagKind): StockBagType {
  return kind === 'THELA' ? StockBagType.THELA : StockBagType.BORI;
}

async function getCarriedRemainderKg(
  tx: Tx,
  productId: number,
  bagType: StockBagType,
): Promise<number> {
  const row = await tx.stockRemainder.findUnique({
    where: { productId_bagType: { productId, bagType } },
  });
  return row ? Number(row.remainderKg) : 0;
}

async function setCarriedRemainderKg(
  tx: Tx,
  productId: number,
  bagType: StockBagType,
  remainderKg: number,
) {
  await tx.stockRemainder.upsert({
    where: { productId_bagType: { productId, bagType } },
    create: { productId, bagType, remainderKg },
    update: { remainderKg },
  });
}

/**
 * Resolve the product whose bag stock a Sale Paunch line should reduce.
 * - Maal Khata lines must map to an active Product (throws if not).
 * - Int/Ext Purchase Party lines have no product stock — returns null (skip intentionally).
 */
export async function resolveSalePaunchStockProduct(
  tx: Tx,
  maalKhataAccountId: number,
): Promise<{ productId: number; productName: string } | null> {
  const account = await tx.account.findFirst({
    where: { id: maalKhataAccountId, isActive: true },
    include: { category: true },
  });
  if (!account) {
    throw new AppError(
      400,
      `Sale Paunch line account #${maalKhataAccountId} was not found or is inactive`,
    );
  }

  const product = await tx.product.findFirst({
    where: { accountId: maalKhataAccountId, isActive: true },
    select: { id: true, name: true },
  });
  if (product) {
    return { productId: product.id, productName: product.name };
  }

  if (isMaalKhataCategoryName(account.category.name)) {
    throw new AppError(
      400,
      `Maal Khata account "${account.name}" is not linked to an active product — cannot deduct bag stock. Fix the product link or pick a different line account.`,
    );
  }

  return null;
}

export type PurchaseMaalStockLine = {
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
};

/** Post Stock IN movements for a Purchase to Maal invoice (same DB transaction). */
export async function postPurchaseMaalStockIn(
  tx: Tx,
  data: {
    productId: number;
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: PurchaseMaalStockLine[];
  },
) {
  const remainders = new Map<StockBagType, number>();
  /** Aggregate bagsIn / rawKg per bag type so one invoice produces one StockMovement per bag type. */
  const bagsInByType = new Map<StockBagType, number>();
  const kgInByType = new Map<StockBagType, number>();

  for (const line of data.lines) {
    const bagType = toStockBagType(bagTypeFromMode(line.boriOrThelaMode));
    if (!remainders.has(bagType)) {
      remainders.set(bagType, await getCarriedRemainderKg(tx, data.productId, bagType));
    }

    const carried = remainders.get(bagType) ?? 0;
    const result = computeStockInFromRow({
      wholeBags: Number(line.bagCount),
      dharanCount: Number(line.dharanCount),
      looseKg: Number(line.looseKg),
      bhartii: Number(line.bhartii),
      carriedRemainderKg: carried,
    });

    remainders.set(bagType, result.newRemainderKg);

    // Raw kg is the physical arrival weight — not bag-bucketed.
    const rawKg = computeRawStockInKg({
      wholeBags: Number(line.bagCount),
      bhartii: Number(line.bhartii),
      dharanCount: Number(line.dharanCount),
      looseKg: Number(line.looseKg),
    });
    if (rawKg > 0) {
      kgInByType.set(bagType, (kgInByType.get(bagType) ?? 0) + rawKg);
    }

    if (!(result.bagsIn > 0)) continue;
    bagsInByType.set(bagType, (bagsInByType.get(bagType) ?? 0) + result.bagsIn);
  }

  const bagTypes = new Set<StockBagType>([...bagsInByType.keys(), ...kgInByType.keys()]);
  for (const bagType of bagTypes) {
    const bagsIn = bagsInByType.get(bagType) ?? 0;
    const kgIn = kgInByType.get(bagType) ?? 0;
    if (!(bagsIn > 0) && !(kgIn > 0)) continue;

    await tx.stockMovement.create({
      data: {
        productId: data.productId,
        bagType,
        direction: StockDirection.IN,
        bags: bagsIn,
        kg: kgIn,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType: InvoiceType.PURCHASE_MAAL,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }

  for (const [bagType, remainderKg] of remainders) {
    await setCarriedRemainderKg(tx, data.productId, bagType, remainderKg);
  }
}

export type SalePaunchStockLine = {
  maalKhataAccountId: number;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  thelaCount: number;
  /** Already-computed Sale Paunch net weight (kg) for this line. */
  netWeightKg: number;
};

/** Post Stock OUT movements for a Sale on Paunch invoice (same DB transaction). */
export async function postSalePaunchStockOut(
  tx: Tx,
  data: {
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: SalePaunchStockLine[];
  },
) {
  for (const line of data.lines) {
    const kind = bagTypeFromMode(line.boriOrThelaMode);
    const bagsOut = computeStockOutBags(line.bagCount, line.thelaCount, kind);
    const kgOut = Math.max(0, Number(line.netWeightKg) || 0);
    if (!(bagsOut > 0) && !(kgOut > 0)) continue;

    const resolved = await resolveSalePaunchStockProduct(tx, line.maalKhataAccountId);
    if (!resolved) {
      // Int/Ext Purchase Party lines: no product bag stock by design.
      console.warn(
        `[stock] Sale Paunch ${data.invoiceReference}: skipping bag/kg stock OUT for account #${line.maalKhataAccountId} `
        + `(not linked to a product; Int/Ext party line). bagsOut=${bagsOut} kgOut=${kgOut}`,
      );
      continue;
    }

    await tx.stockMovement.create({
      data: {
        productId: resolved.productId,
        bagType: toStockBagType(kind),
        direction: StockDirection.OUT,
        bags: bagsOut,
        kg: kgOut,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType: InvoiceType.SALE_PAUNCH,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }
}

export async function getStockReport(params: {
  productId: number;
  bagType: 'BORI' | 'THELA';
  pagination?: { limit: number; offset: number } | null;
}) {
  const product = await prisma.product.findFirst({
    where: { id: params.productId, isActive: true, status: USER_VISIBLE_PRODUCT_STATUS },
    include: { category: true },
  });
  if (!product) throw new AppError(404, 'Product not found');

  if (product.category.stockMode === 'QUANTITY') {
    return getQuantityStockReport({
      productId: params.productId,
      pagination: params.pagination,
    });
  }

  const bagType = toStockBagType(params.bagType);
  const movements = await prisma.stockMovement.findMany({
    where: { productId: params.productId, bagType },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  const remainder = await prisma.stockRemainder.findUnique({
    where: { productId_bagType: { productId: params.productId, bagType } },
  });

  let running = 0;
  let runningKg = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalKgIn = 0;
  let totalKgOut = 0;
  const allRows = movements.map((m) => {
    const bags = Number(m.bags);
    const kg = Number(m.kg ?? 0);
    if (m.direction === StockDirection.IN) {
      running += bags;
      runningKg += kg;
      totalIn += bags;
      totalKgIn += kg;
    } else {
      running -= bags;
      runningKg -= kg;
      totalOut += bags;
      totalKgOut += kg;
    }
    return {
      id: m.id,
      date: m.date.toISOString(),
      description: m.description ?? m.invoiceReference,
      invoiceReference: m.invoiceReference,
      invoiceType: m.invoiceType,
      status: m.direction as 'IN' | 'OUT',
      bags,
      kg,
      quantity: bags,
      runningBalance: running,
      runningKg,
    };
  });

  /** Product-wide kg (both Bori and Thela) — genuine total KG in stock. */
  const allProductMovements = await prisma.stockMovement.findMany({
    where: { productId: params.productId },
    select: { direction: true, kg: true },
  });
  let productKgBalance = 0;
  for (const m of allProductMovements) {
    const kg = Number(m.kg ?? 0);
    productKgBalance += m.direction === StockDirection.IN ? kg : -kg;
  }

  const total = allRows.length;
  let rows = allRows;
  let limit = total;
  let offset = 0;
  if (params.pagination) {
    limit = params.pagination.limit;
    offset = params.pagination.offset;
    rows = allRows.slice(offset, offset + limit);
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      code: product.code,
      stockMode: 'GRAIN_BAGS' as const,
      unit: product.unit,
    },
    bagType: params.bagType,
    stockMode: 'GRAIN_BAGS' as const,
    trackingStartedAt: STOCK_TRACKING_STARTED_AT.toISOString(),
    /** Historical invoices before stock feature ship are not backfilled (bags or kg). */
    historicalBackfill: false as const,
    carriedRemainderKg: remainder ? Number(remainder.remainderKg) : 0,
    rows,
    total,
    limit: params.pagination ? limit : total,
    offset: params.pagination ? offset : 0,
    totals: {
      totalIn,
      totalOut,
      netBalance: running,
      totalKgIn,
      totalKgOut,
      netKg: runningKg,
      /** Net physical kg across Bori + Thela for this product. */
      productKgBalance,
    },
  };
}

/** Quantity stock report for General Goods products — negatives shown plainly (no clamp). */
export async function getQuantityStockReport(params: {
  productId: number;
  pagination?: { limit: number; offset: number } | null;
}) {
  const product = await prisma.product.findFirst({
    where: { id: params.productId, isActive: true, status: USER_VISIBLE_PRODUCT_STATUS },
    include: { category: true },
  });
  if (!product) throw new AppError(404, 'Product not found');
  if (product.category.stockMode !== 'QUANTITY') {
    throw new AppError(400, 'Product does not use quantity stock');
  }

  const movements = await prisma.productQuantityMovement.findMany({
    where: { productId: params.productId },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  let running = 0;
  let totalIn = 0;
  let totalOut = 0;
  const allRows = movements.map((m) => {
    const quantity = Number(m.quantity);
    if (m.direction === StockDirection.IN) {
      running += quantity;
      totalIn += quantity;
    } else {
      running -= quantity;
      totalOut += quantity;
    }
    return {
      id: m.id,
      date: m.date.toISOString(),
      description: m.description ?? m.invoiceReference,
      invoiceReference: m.invoiceReference,
      invoiceType: m.invoiceType,
      status: m.direction as 'IN' | 'OUT',
      bags: quantity,
      kg: 0,
      quantity,
      runningBalance: running,
      runningKg: 0,
    };
  });

  const total = allRows.length;
  let rows = allRows;
  let limit = total;
  let offset = 0;
  if (params.pagination) {
    limit = params.pagination.limit;
    offset = params.pagination.offset;
    rows = allRows.slice(offset, offset + limit);
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      code: product.code,
      stockMode: 'QUANTITY' as const,
      unit: product.unit,
    },
    bagType: null,
    stockMode: 'QUANTITY' as const,
    trackingStartedAt: STOCK_TRACKING_STARTED_AT.toISOString(),
    historicalBackfill: false as const,
    carriedRemainderKg: 0,
    rows,
    total,
    limit: params.pagination ? limit : total,
    offset: params.pagination ? offset : 0,
    totals: {
      totalIn,
      totalOut,
      netBalance: running,
      totalKgIn: 0,
      totalKgOut: 0,
      netKg: 0,
      productKgBalance: 0,
    },
  };
}

/** Net Bori/Thela bag balances + physical kg per product for dashboard glance. */
export async function getProductStockBalances() {
  const products = await prisma.product.findMany({
    where: { isActive: true, status: USER_VISIBLE_PRODUCT_STATUS },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) return [];

  const movements = await prisma.stockMovement.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    select: { productId: true, bagType: true, direction: true, bags: true, kg: true },
  });

  const nets = new Map<number, { bori: number; thela: number; kg: number }>();
  for (const m of movements) {
    const row = nets.get(m.productId) ?? { bori: 0, thela: 0, kg: 0 };
    const bags = Number(m.bags);
    const kg = Number(m.kg ?? 0);
    const signedBags = m.direction === StockDirection.IN ? bags : -bags;
    const signedKg = m.direction === StockDirection.IN ? kg : -kg;
    if (m.bagType === StockBagType.THELA) row.thela += signedBags;
    else row.bori += signedBags;
    row.kg += signedKg;
    nets.set(m.productId, row);
  }

  return products
    .map((p) => {
      const net = nets.get(p.id) ?? { bori: 0, thela: 0, kg: 0 };
      return {
        productId: p.id,
        name: p.name,
        code: p.code,
        bori: net.bori,
        thela: net.thela,
        kg: net.kg,
      };
    })
    .filter((p) => p.bori !== 0 || p.thela !== 0 || p.kg !== 0);
}
