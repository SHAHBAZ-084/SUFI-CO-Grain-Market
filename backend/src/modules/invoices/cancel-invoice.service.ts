import {
  InvoiceStatus,
  InvoiceType,
  Prisma,
  VoucherStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  assertActiveFinancialYear,
  cancelVoucherInTx,
} from '../accounting/accounting.service';
import { reverseEmptyBardanaForInvoiceInTx } from '../inventory/bardana.service';
import { reverseInvoiceQuantityMovementsInTx } from '../stock/quantity-stock.service';
import {
  rebuildPurchaseMaalRemaindersInTx,
  reverseInvoiceStockMovementsInTx,
} from '../stock/stock.service';

type Tx = Prisma.TransactionClient;

const CANCEL_TX_OPTIONS = { maxWait: 30_000, timeout: 120_000 } as const;

async function reverseInvoiceSideEffectsInTx(tx: Tx, invoice: {
  id: number;
  type: InvoiceType;
  productId: number | null;
  status: InvoiceStatus;
}) {
  if (invoice.status !== InvoiceStatus.POSTED) return;

  switch (invoice.type) {
    case InvoiceType.PURCHASE_MAAL: {
      await reverseInvoiceStockMovementsInTx(tx, invoice.id);
      if (invoice.productId != null) {
        await rebuildPurchaseMaalRemaindersInTx(tx, invoice.productId, invoice.id);
      }
      break;
    }
    case InvoiceType.SALE_PAUNCH: {
      await reverseInvoiceStockMovementsInTx(tx, invoice.id);
      await reverseEmptyBardanaForInvoiceInTx(tx, invoice.id);
      break;
    }
    case InvoiceType.PURCHASE_GENERAL:
    case InvoiceType.SALE_GENERAL:
    case InvoiceType.GENERAL_TRADE: {
      await reverseInvoiceQuantityMovementsInTx(tx, invoice.id);
      break;
    }
    case InvoiceType.KACHI_MAAL:
    case InvoiceType.SALE_COMMISSION:
      // Ledger-only — vouchers cancelled separately.
      break;
    default:
      break;
  }
}

export async function cancelInvoiceInTx(
  tx: Tx,
  invoiceId: number,
  userId: number,
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      vouchers: { include: { voucher: true } },
    },
  });
  if (!invoice) throw new AppError(404, 'Invoice not found');
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw new AppError(400, 'Invoice is already cancelled');
  }

  if (
    invoice.status === InvoiceStatus.PENDING_APPROVAL
    || invoice.status === InvoiceStatus.DRAFT
    || invoice.status === InvoiceStatus.REJECTED
  ) {
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }

  if (invoice.status !== InvoiceStatus.POSTED) {
    throw new AppError(400, `Cannot cancel invoice in status ${invoice.status}`);
  }

  if (invoice.financialYearId != null) {
    await assertActiveFinancialYear(tx, invoice.financialYearId);
  }

  // Stock / bardana / quantity first (while invoice still POSTED for remainder rebuild exclude).
  await reverseInvoiceSideEffectsInTx(tx, invoice);

  const linkedVouchers = invoice.vouchers
    .map((link) => link.voucher)
    .filter((voucher) => voucher != null && voucher.status === VoucherStatus.ACTIVE);

  for (const voucher of linkedVouchers) {
    await cancelVoucherInTx(tx, voucher.id, userId);
  }

  return tx.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.CANCELLED },
    include: {
      vouchers: { include: { voucher: true } },
    },
  });
}

/**
 * Soft-cancel an invoice: reverse stock/bardana/qty, cancel linked vouchers via
 * cancelVoucherInTx, mark InvoiceStatus.CANCELLED. Single interactive transaction.
 */
export async function cancelInvoice(invoiceId: number, userId: number) {
  return prisma.$transaction(
    async (tx) => cancelInvoiceInTx(tx, invoiceId, userId),
    CANCEL_TX_OPTIONS,
  );
}
