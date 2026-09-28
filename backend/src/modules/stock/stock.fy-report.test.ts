import { FinancialYearStatus, InvoiceType, StockBagType, StockDirection } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { getActiveFinancialYearId } from '../accounting/accounting.service';
import { createProduct } from '../products/products.service';
import { approveProduct } from '../../test-helpers/approval';
import { getStockReport } from './stock.service';

describe('stock report financial year scoping', () => {
  const stamp = Date.now();
  let productId: number;
  let year1Id: number;
  let year2Id: number;
  let activeYearId: number;
  const movementIds: number[] = [];

  beforeAll(async () => {
    activeYearId = await getActiveFinancialYearId(prisma);

    const product = await createProduct({
      name: `FY Stock ${stamp}`,
      openingBalance: 0,
      createdById: 1,
    });
    await approveProduct(product.id);
    productId = product.id;

    // Two synthetic closed years that split the movements (do not touch ACTIVE).
    const year1 = await prisma.financialYear.create({
      data: {
        label: `FY-Stock-Y1-${stamp}`,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        status: FinancialYearStatus.CLOSED,
        closedAt: new Date(),
      },
    });
    const year2 = await prisma.financialYear.create({
      data: {
        label: `FY-Stock-Y2-${stamp}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        status: FinancialYearStatus.CLOSED,
        closedAt: new Date(),
      },
    });
    year1Id = year1.id;
    year2Id = year2.id;

    const rows = [
      { date: new Date('2026-08-10T12:00:00.000Z'), direction: StockDirection.IN, bags: 100, kg: 4000 },
      { date: new Date('2026-08-20T12:00:00.000Z'), direction: StockDirection.OUT, bags: 30, kg: 1200 },
      { date: new Date('2026-09-05T12:00:00.000Z'), direction: StockDirection.IN, bags: 50, kg: 2000 },
      { date: new Date('2026-09-15T12:00:00.000Z'), direction: StockDirection.OUT, bags: 20, kg: 800 },
    ];

    for (const row of rows) {
      const created = await prisma.stockMovement.create({
        data: {
          productId,
          bagType: StockBagType.THELA,
          direction: row.direction,
          bags: row.bags,
          kg: row.kg,
          date: row.date,
          invoiceReference: `FY-STOCK-${stamp}`,
          invoiceType: InvoiceType.PURCHASE_MAAL,
          description: `FY stock test ${row.date.toISOString().slice(0, 10)}`,
        },
      });
      movementIds.push(created.id);
    }
  });

  afterAll(async () => {
    if (movementIds.length) {
      await prisma.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
    }
    if (productId) {
      await prisma.stockRemainder.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } }).catch(() => undefined);
    }
    if (year1Id) await prisma.financialYear.delete({ where: { id: year1Id } }).catch(() => undefined);
    if (year2Id) await prisma.financialYear.delete({ where: { id: year2Id } }).catch(() => undefined);
  });

  it('year 2 opening equals year 1 closing and running balances continue', async () => {
    const y1 = await getStockReport({
      productId,
      bagType: 'THELA',
      financialYearId: year1Id,
    });
    const y2 = await getStockReport({
      productId,
      bagType: 'THELA',
      financialYearId: year2Id,
    });

    expect(y1.emptyReason).toBeNull();
    expect(y2.emptyReason).toBeNull();

    expect(y1.totals.openingBalance).toBe(0);
    expect(y1.totals.totalIn).toBe(100);
    expect(y1.totals.totalOut).toBe(30);
    expect(y1.totals.closingBalance).toBe(70);
    expect(y1.totals.openingKg).toBe(0);
    expect(y1.totals.closingKg).toBe(2800);
    expect(y1.rows).toHaveLength(2);
    expect(y1.rows[0].runningBalance).toBe(100);
    expect(y1.rows[1].runningBalance).toBe(70);

    expect(y2.totals.openingBalance).toBe(y1.totals.closingBalance);
    expect(y2.totals.openingKg).toBe(y1.totals.closingKg);
    expect(y2.totals.totalIn).toBe(50);
    expect(y2.totals.totalOut).toBe(20);
    expect(y2.totals.closingBalance).toBe(100);
    expect(y2.totals.closingKg).toBe(4000);
    expect(y2.rows).toHaveLength(2);
    expect(y2.rows[0].runningBalance).toBe(120); // 70 + 50
    expect(y2.rows[1].runningBalance).toBe(100); // 120 - 20

    // productKgBalance as of each year's end (THELA-only movements in this fixture)
    expect(y1.totals.productKgBalance).toBe(2800);
    expect(y2.totals.productKgBalance).toBe(4000);

    // Closed year must not surface today's StockRemainder
    expect(y1.carriedRemainderKg).toBe(0);
    expect(y2.carriedRemainderKg).toBe(0);
  });

  it('active year (explicit id) matches omitted financialYearId', async () => {
    const implicit = await getStockReport({ productId, bagType: 'THELA' });
    const explicit = await getStockReport({
      productId,
      bagType: 'THELA',
      financialYearId: activeYearId,
    });

    expect(explicit.totals).toEqual(implicit.totals);
    expect(explicit.rows.map((r) => r.id)).toEqual(implicit.rows.map((r) => r.id));
    expect(explicit.rows.map((r) => r.runningBalance)).toEqual(
      implicit.rows.map((r) => r.runningBalance),
    );
  });

  it('shows empty reason when year ended before stock tracking started', async () => {
    const pre = await prisma.financialYear.create({
      data: {
        label: `FY-Stock-Pre-${stamp}`,
        startDate: new Date('2025-07-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        status: FinancialYearStatus.CLOSED,
        closedAt: new Date(),
      },
    });
    try {
      const report = await getStockReport({
        productId,
        bagType: 'THELA',
        financialYearId: pre.id,
      });
      expect(report.emptyReason).toMatch(/Stock tracking began on/i);
      expect(report.rows).toHaveLength(0);
      expect(report.totals.openingBalance).toBe(0);
      expect(report.totals.closingBalance).toBe(0);
    } finally {
      await prisma.financialYear.delete({ where: { id: pre.id } });
    }
  });
});
