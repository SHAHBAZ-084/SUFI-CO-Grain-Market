import {
  AdjustmentStatus,
  InvoiceStatus,
  OpeningBalanceSide,
  Prisma,
  RecordStatus,
  VoucherStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  approvePendingAccountAdjustmentInTx,
  approvePendingStockAdjustmentInTx,
  getPendingAccountAdjustmentDetail,
  getPendingStockAdjustmentDetail,
  patchPendingAccountAdjustment,
  patchPendingStockAdjustment,
  rejectPendingAccountAdjustment,
  rejectPendingStockAdjustment,
} from '../adjustments/adjustments.service';
import {
  approvePendingAccountInTx,
  approvePendingStandardVoucherInTx,
} from '../accounting/accounting.service';
import { approvePendingKachiMaalInvoice } from '../invoices/kachi-maal.service';
import { approvePendingPurchaseMaalInvoice } from '../invoices/purchase-maal.service';
import { approvePendingSaleCommissionInvoice } from '../invoices/sale-commission.service';
import { approvePendingSalePaunchInvoice } from '../invoices/sale-paunch.service';
import { approvePendingProductInTx } from '../products/products.service';
import { assertCanEditPendingRecord } from './approval-permissions';
import {
  accountRef,
  invoiceTypeLabel,
  sideAccounts,
  voucherApprovalAccounts,
  voucherApprovalTypeLabel,
} from './approval-display';
import type { ApprovalKind, PendingApprovalItem } from './approval-types';

const userSelect = { id: true, displayName: true, username: true } as const;

function sortPending(items: PendingApprovalItem[]): PendingApprovalItem[] {
  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function listPendingApprovals(): Promise<PendingApprovalItem[]> {
  const [accounts, products, vouchers, invoices, accountAdjustments, stockAdjustments] =
    await Promise.all([
    prisma.account.findMany({
      where: { status: RecordStatus.PENDING_APPROVAL, isActive: true, isHidden: false },
      include: { createdBy: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { status: RecordStatus.PENDING_APPROVAL, isActive: true },
      include: {
        createdBy: { select: userSelect },
        account: {
          select: {
            name: true,
            code: true,
            pendingOpeningBalance: true,
            pendingOpeningBalanceSide: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.voucher.findMany({
      where: { status: VoucherStatus.PENDING_APPROVAL },
      include: {
        createdBy: { select: userSelect },
        debitAccount: { select: { name: true, code: true } },
        creditAccount: { select: { name: true, code: true } },
        invoiceLink: { include: { invoice: { select: { type: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { status: InvoiceStatus.PENDING_APPROVAL },
      include: {
        createdBy: { select: userSelect },
        debitAccount: { select: { name: true, code: true } },
        product: {
          select: {
            name: true,
            code: true,
            account: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.accountAdjustment.findMany({
      where: { status: AdjustmentStatus.PENDING_APPROVAL },
      include: {
        createdBy: { select: userSelect },
        account: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockAdjustment.findMany({
      where: { status: AdjustmentStatus.PENDING_APPROVAL },
      include: {
        createdBy: { select: userSelect },
        product: {
          select: {
            name: true,
            code: true,
            account: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const items: PendingApprovalItem[] = [
    ...accounts.map((row) => {
      const amount =
        row.pendingOpeningBalance != null ? Number(row.pendingOpeningBalance) : null;
      const side = row.pendingOpeningBalanceSide ?? OpeningBalanceSide.DR;
      const { debitAccount, creditAccount } = sideAccounts(
        side,
        accountRef(row.name, row.code),
        amount ?? 0,
      );
      return {
        kind: 'account' as const,
        id: row.id,
        label: row.name,
        sublabel: row.code,
        amount,
        reference: row.code,
        recordType: row.type,
        recordDate: row.createdAt.toISOString(),
        typeLabel: 'New Account',
        debitAccount,
        creditAccount,
        description: amount != null && amount > 0 ? `Opening balance ${side}` : null,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      };
    }),
    ...products.map((row) => {
      const linked = row.account;
      const amount =
        linked?.pendingOpeningBalance != null
          ? Number(linked.pendingOpeningBalance)
          : null;
      const side = linked?.pendingOpeningBalanceSide ?? OpeningBalanceSide.DR;
      const primary = linked
        ? accountRef(linked.name, linked.code)
        : accountRef(row.name, row.code);
      const { debitAccount, creditAccount } = sideAccounts(side, primary, amount ?? 0);
      return {
        kind: 'product' as const,
        id: row.id,
        label: row.name,
        sublabel: row.code,
        reference: row.code,
        recordDate: row.createdAt.toISOString(),
        typeLabel: 'New Product',
        amount,
        debitAccount,
        creditAccount,
        description: row.unit ? `Unit: ${row.unit}` : null,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      };
    }),
    ...vouchers.map((row) => {
      const { debitAccount, creditAccount } = voucherApprovalAccounts(row);
      return {
        kind: 'voucher' as const,
        id: row.id,
        label: `${row.type} #${row.number}`,
        sublabel: row.reference,
        amount: Number(row.amount),
        reference: row.reference,
        recordType: row.type,
        recordDate: row.date.toISOString(),
        typeLabel: voucherApprovalTypeLabel(row),
        debitAccount,
        creditAccount,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      };
    }),
    ...invoices.map((row) => ({
      kind: 'invoice' as const,
      id: row.id,
      label: row.reference,
      sublabel: row.type,
      amount: Number(row.total),
      reference: row.reference,
      recordType: row.type,
      recordDate: (row.invoiceDate ?? row.createdAt).toISOString(),
      typeLabel: invoiceTypeLabel(row.type),
      debitAccount: row.debitAccount
        ? accountRef(row.debitAccount.name, row.debitAccount.code)
        : null,
      creditAccount: row.product?.account
        ? accountRef(row.product.account.name, row.product.account.code)
        : row.product
          ? accountRef(row.product.name, row.product.code)
          : null,
      description: row.tafseel ?? row.notes,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    })),
    ...accountAdjustments.map((row) => {
      const primary = accountRef(row.account.name, row.account.code);
      const amount = Number(row.amount);
      const { debitAccount, creditAccount } = sideAccounts(row.side, primary, amount);
      return {
        kind: 'account-adjustment' as const,
        id: row.id,
        label: row.account.name,
        sublabel: `${row.side} adjustment`,
        amount,
        reference: row.account.code,
        recordType: row.side,
        recordDate: row.adjustmentDate.toISOString(),
        typeLabel: 'Account Adjustment',
        debitAccount,
        creditAccount,
        description: row.notes,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      };
    }),
    ...stockAdjustments.map((row) => {
      const primary = accountRef(row.product.account.name, row.product.account.code);
      const amount = Number(row.amount);
      const { debitAccount, creditAccount } = sideAccounts(row.side, primary, amount);
      return {
        kind: 'stock-adjustment' as const,
        id: row.id,
        label: row.product.name,
        sublabel: `${row.direction} ${row.bagType}`,
        amount,
        reference: row.product.code,
        recordType: `${row.direction}/${row.bagType}`,
        recordDate: row.adjustmentDate.toISOString(),
        typeLabel: `Stock ${row.direction}`,
        debitAccount,
        creditAccount,
        description: row.notes ?? `${row.bags} bags (${row.bagType})`,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      };
    }),
  ];

  return sortPending(items);
}

export async function getPendingApprovalDetail(kind: ApprovalKind, id: number) {
  switch (kind) {
    case 'account': {
      const account = await prisma.account.findFirst({
        where: { id, status: RecordStatus.PENDING_APPROVAL },
        include: {
          category: true,
          ledger: true,
          createdBy: { select: userSelect },
        },
      });
      if (!account) throw new AppError(404, 'Pending account not found');
      return { kind, record: account };
    }
    case 'product': {
      const product = await prisma.product.findFirst({
        where: { id, status: RecordStatus.PENDING_APPROVAL },
        include: {
          account: { include: { ledger: true, category: true } },
          createdBy: { select: userSelect },
        },
      });
      if (!product) throw new AppError(404, 'Pending product not found');
      return { kind, record: product };
    }
    case 'voucher': {
      const voucher = await prisma.voucher.findFirst({
        where: { id, status: VoucherStatus.PENDING_APPROVAL },
        include: {
          debitAccount: true,
          creditAccount: true,
          createdBy: { select: userSelect },
        },
      });
      if (!voucher) throw new AppError(404, 'Pending voucher not found');
      return { kind, record: voucher };
    }
    case 'invoice': {
      const invoice = await prisma.invoice.findFirst({
        where: { id, status: InvoiceStatus.PENDING_APPROVAL },
        include: {
          debitAccount: true,
          product: true,
          kachiMaalLines: { orderBy: { sortOrder: 'asc' } },
          purchaseMaalLines: { orderBy: { sortOrder: 'asc' } },
          saleCommissionLines: { orderBy: { sortOrder: 'asc' } },
          salePaunchLines: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: userSelect },
        },
      });
      if (!invoice) throw new AppError(404, 'Pending invoice not found');
      return { kind, record: invoice };
    }
    case 'account-adjustment': {
      const adjustment = await getPendingAccountAdjustmentDetail(id);
      return { kind, record: adjustment };
    }
    case 'stock-adjustment': {
      const adjustment = await getPendingStockAdjustmentDetail(id);
      return { kind, record: adjustment };
    }
    default:
      throw new AppError(400, 'Invalid approval type');
  }
}

export async function patchPendingApproval(
  kind: ApprovalKind,
  id: number,
  editor: { id: number; role: 'ADMIN' | 'USER' },
  data: Record<string, unknown>,
) {
  const detail = await getPendingApprovalDetail(kind, id);
  const createdById = detail.record.createdById as number | null | undefined;

  assertCanEditPendingRecord(editor, createdById);

  switch (kind) {
    case 'account': {
      const updates: Prisma.AccountUpdateInput = {};
      if (typeof data.name === 'string' && data.name.trim()) {
        updates.name = data.name.trim();
      }
      if (data.pendingOpeningBalance !== undefined) {
        const amount = Number(data.pendingOpeningBalance);
        if (!(amount >= 0)) throw new AppError(400, 'Opening balance must be zero or greater');
        updates.pendingOpeningBalance = amount;
      }
      if (data.pendingOpeningBalanceSide === 'DR' || data.pendingOpeningBalanceSide === 'CR') {
        updates.pendingOpeningBalanceSide = data.pendingOpeningBalanceSide as OpeningBalanceSide;
      }
      if (Object.keys(updates).length === 0) {
        throw new AppError(400, 'No valid fields to update');
      }
      return prisma.account.update({
        where: { id },
        data: updates,
        include: { category: true, ledger: true, createdBy: { select: userSelect } },
      });
    }
    case 'product': {
      const updates: Prisma.ProductUpdateInput = {};
      if (typeof data.name === 'string' && data.name.trim()) {
        updates.name = data.name.trim();
      }
      if (typeof data.unit === 'string') {
        updates.unit = data.unit.trim() || null;
      }
      if (Object.keys(updates).length === 0) {
        throw new AppError(400, 'No valid fields to update');
      }
      return prisma.product.update({
        where: { id },
        data: updates,
        include: {
          account: { include: { ledger: true, category: true } },
          createdBy: { select: userSelect },
        },
      });
    }
    case 'voucher': {
      const updates: Prisma.VoucherUpdateInput = {};
      if (typeof data.description === 'string') updates.description = data.description.trim() || null;
      if (typeof data.reference === 'string') updates.reference = data.reference.trim() || null;
      if (data.amount != null) {
        const amount = Number(data.amount);
        if (!(amount > 0)) throw new AppError(400, 'Amount must be greater than zero');
        updates.amount = amount;
      }
      if (typeof data.date === 'string') updates.date = new Date(data.date);
      if (data.debitAccountId != null) updates.debitAccount = { connect: { id: Number(data.debitAccountId) } };
      if (data.creditAccountId != null) {
        updates.creditAccount = { connect: { id: Number(data.creditAccountId) } };
      }
      if (Object.keys(updates).length === 0) {
        throw new AppError(400, 'No valid fields to update');
      }
      return prisma.voucher.update({
        where: { id },
        data: updates,
        include: { debitAccount: true, creditAccount: true, createdBy: { select: userSelect } },
      });
    }
    case 'invoice': {
      const updates: Prisma.InvoiceUpdateInput = {};
      if (typeof data.notes === 'string') updates.notes = data.notes.trim() || null;
      if (typeof data.billNo === 'string') updates.billNo = data.billNo.trim() || null;
      if (typeof data.gariNo === 'string') updates.gariNo = data.gariNo.trim() || null;
      if (typeof data.tafseel === 'string') updates.tafseel = data.tafseel.trim() || null;
      if (typeof data.invoiceDate === 'string') updates.invoiceDate = new Date(data.invoiceDate);
      if (Object.keys(updates).length === 0) {
        throw new AppError(400, 'No valid fields to update');
      }
      return prisma.invoice.update({
        where: { id },
        data: updates,
        include: {
          debitAccount: true,
          product: true,
          createdBy: { select: userSelect },
        },
      });
    }
    case 'account-adjustment':
      return patchPendingAccountAdjustment(id, data);
    case 'stock-adjustment':
      return patchPendingStockAdjustment(id, data);
    default:
      throw new AppError(400, 'Invalid approval type');
  }
}

async function approveInTx(tx: Prisma.TransactionClient, kind: ApprovalKind, id: number) {
  switch (kind) {
    case 'account':
      return approvePendingAccountInTx(tx, id);
    case 'product':
      return approvePendingProductInTx(tx, id);
    case 'voucher':
      return approvePendingStandardVoucherInTx(tx, id);
    case 'invoice': {
      const invoice = await tx.invoice.findFirst({
        where: { id, status: InvoiceStatus.PENDING_APPROVAL },
        select: { type: true },
      });
      if (!invoice) throw new AppError(404, 'Pending invoice not found');
      switch (invoice.type) {
        case 'KACHI_MAAL':
          return approvePendingKachiMaalInvoice(tx, id);
        case 'PURCHASE_MAAL':
          return approvePendingPurchaseMaalInvoice(tx, id);
        case 'SALE_COMMISSION':
          return approvePendingSaleCommissionInvoice(tx, id);
        case 'SALE_PAUNCH':
          return approvePendingSalePaunchInvoice(tx, id);
        default:
          throw new AppError(400, 'Unsupported invoice type');
      }
    }
    case 'account-adjustment':
      return approvePendingAccountAdjustmentInTx(tx, id);
    case 'stock-adjustment':
      return approvePendingStockAdjustmentInTx(tx, id);
    default:
      throw new AppError(400, 'Invalid approval type');
  }
}

export async function approvePendingRecord(kind: ApprovalKind, id: number) {
  return prisma.$transaction(async (tx) => approveInTx(tx, kind, id));
}

export async function rejectPendingRecord(kind: ApprovalKind, id: number) {
  switch (kind) {
    case 'account': {
      const account = await prisma.account.findFirst({
        where: { id, status: RecordStatus.PENDING_APPROVAL },
      });
      if (!account) throw new AppError(404, 'Pending account not found');
      return prisma.account.update({
        where: { id },
        data: { status: RecordStatus.REJECTED },
      });
    }
    case 'product': {
      const product = await prisma.product.findFirst({
        where: { id, status: RecordStatus.PENDING_APPROVAL },
      });
      if (!product) throw new AppError(404, 'Pending product not found');
      await prisma.account.updateMany({
        where: { id: product.accountId, status: RecordStatus.PENDING_APPROVAL },
        data: { status: RecordStatus.REJECTED },
      });
      return prisma.product.update({
        where: { id },
        data: { status: RecordStatus.REJECTED },
      });
    }
    case 'voucher': {
      const voucher = await prisma.voucher.findFirst({
        where: { id, status: VoucherStatus.PENDING_APPROVAL },
      });
      if (!voucher) throw new AppError(404, 'Pending voucher not found');
      return prisma.voucher.update({
        where: { id },
        data: { status: VoucherStatus.REJECTED },
      });
    }
    case 'invoice': {
      const invoice = await prisma.invoice.findFirst({
        where: { id, status: InvoiceStatus.PENDING_APPROVAL },
      });
      if (!invoice) throw new AppError(404, 'Pending invoice not found');
      return prisma.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.REJECTED },
      });
    }
    case 'account-adjustment':
      return rejectPendingAccountAdjustment(id);
    case 'stock-adjustment':
      return rejectPendingStockAdjustment(id);
    default:
      throw new AppError(400, 'Invalid approval type');
  }
}
