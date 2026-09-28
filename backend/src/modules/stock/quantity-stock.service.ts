import { InvoiceType, Prisma, StockDirection } from '@prisma/client';
import { AppError } from '../../utils/helpers';
import { roundMoney } from '../invoices/purchase-maal.calculations';

type Tx = Prisma.TransactionClient;

/** Signed on-hand quantity from ProductQuantityMovement (can be negative). */
export async function getProductQuantityOnHand(tx: Tx, productId: number): Promise<number> {
  const movements = await tx.productQuantityMovement.findMany({
    where: { productId },
    select: { direction: true, quantity: true },
  });
  let qty = 0;
  for (const m of movements) {
    const n = Number(m.quantity);
    qty += m.direction === StockDirection.IN ? n : -n;
  }
  return roundMoney(qty);
}

export async function postGeneralPurchaseQuantityIn(
  tx: Tx,
  data: {
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: Array<{ productId: number; quantity: number }>;
    invoiceType?: InvoiceType;
  },
) {
  const invoiceType = data.invoiceType ?? InvoiceType.PURCHASE_GENERAL;
  for (const line of data.lines) {
    if (!(line.quantity > 0)) continue;
    await tx.productQuantityMovement.create({
      data: {
        productId: line.productId,
        direction: StockDirection.IN,
        quantity: line.quantity,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }
}

export async function postGeneralSaleQuantityOut(
  tx: Tx,
  data: {
    invoiceId: number;
    invoiceReference: string;
    invoiceDate: Date;
    lines: Array<{ productId: number; quantity: number }>;
    invoiceType?: InvoiceType;
  },
) {
  const invoiceType = data.invoiceType ?? InvoiceType.SALE_GENERAL;
  for (const line of data.lines) {
    if (!(line.quantity > 0)) continue;
    await tx.productQuantityMovement.create({
      data: {
        productId: line.productId,
        direction: StockDirection.OUT,
        quantity: line.quantity,
        date: data.invoiceDate,
        invoiceId: data.invoiceId,
        invoiceType,
        invoiceReference: data.invoiceReference,
        description: data.invoiceReference,
      },
    });
  }
}

/**
 * Weighted average cost after a purchase receipt.
 * newAvg = (oldQty × oldAvg + purchaseValue) / (oldQty + purchaseQty)
 */
export function computeWeightedAverageCost(params: {
  oldQty: number;
  oldAverageCost: number | null | undefined;
  purchaseQty: number;
  purchaseValue: number;
}): number | null {
  const purchaseQty = Number(params.purchaseQty);
  if (!(purchaseQty > 0)) return params.oldAverageCost != null ? Number(params.oldAverageCost) : null;

  const oldQty = Number(params.oldQty);
  const oldAvg = params.oldAverageCost != null ? Number(params.oldAverageCost) : 0;
  const newQty = oldQty + purchaseQty;
  if (Math.abs(newQty) < 1e-9) return null;

  const existingValue = oldQty * oldAvg;
  return roundMoney((existingValue + Number(params.purchaseValue)) / newQty);
}

export async function applyPurchaseWeightedAverageCost(
  tx: Tx,
  productId: number,
  purchaseQty: number,
  purchaseValue: number,
) {
  const product = await tx.product.findFirst({ where: { id: productId } });
  if (!product) throw new AppError(400, 'Product not found for average cost update');

  const oldQty = await getProductQuantityOnHand(tx, productId);
  const next = computeWeightedAverageCost({
    oldQty,
    oldAverageCost: product.averageCost != null ? Number(product.averageCost) : null,
    purchaseQty,
    purchaseValue,
  });

  await tx.product.update({
    where: { id: productId },
    data: { averageCost: next },
  });

  return next;
}

async function purchaseValueForQuantityIn(
  tx: Tx,
  invoiceId: number | null,
  productId: number,
  quantity: number,
): Promise<number> {
  if (invoiceId == null) return 0;
  const lines = await tx.generalPurchaseLine.findMany({
    where: { invoiceId, productId },
  });
  if (lines.length === 0) return 0;
  // Match posting: inventory debit = lineTotal + mazduri.
  const totalValue = lines.reduce(
    (sum, line) => sum + Number(line.lineTotal) + Number(line.mazduriAmount),
    0,
  );
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  if (!(totalQty > 0)) return 0;
  return roundMoney(totalValue * (quantity / totalQty));
}

/** Rebuild average cost by replaying remaining quantity movements in date order. */
export async function rebuildAverageCostInTx(tx: Tx, productId: number) {
  const movements = await tx.productQuantityMovement.findMany({
    where: { productId },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  let onHand = 0;
  let avg: number | null = null;
  for (const movement of movements) {
    const qty = Number(movement.quantity);
    if (movement.direction === StockDirection.IN) {
      const purchaseValue = await purchaseValueForQuantityIn(
        tx,
        movement.invoiceId,
        productId,
        qty,
      );
      avg = computeWeightedAverageCost({
        oldQty: onHand,
        oldAverageCost: avg,
        purchaseQty: qty,
        purchaseValue,
      });
      onHand += qty;
    } else {
      onHand -= qty;
    }
  }

  await tx.product.update({
    where: { id: productId },
    data: { averageCost: avg },
  });
}

/** Remove quantity movements for an invoice and rebuild WAC for affected products. */
export async function reverseInvoiceQuantityMovementsInTx(tx: Tx, invoiceId: number) {
  const movements = await tx.productQuantityMovement.findMany({
    where: { invoiceId },
    select: { productId: true },
  });
  const productIds = [...new Set(movements.map((m) => m.productId))];
  await tx.productQuantityMovement.deleteMany({ where: { invoiceId } });
  for (const productId of productIds) {
    await rebuildAverageCostInTx(tx, productId);
  }
}
