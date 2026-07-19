import { AccountType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

export const PRODUCTS_CATEGORY_NAME = 'Products';

async function ensureProductsCategoryInTx(tx: Prisma.TransactionClient) {
  const existing = await tx.accountCategory.findFirst({
    where: { isActive: true, name: PRODUCTS_CATEGORY_NAME },
  });
  if (existing) return existing;
  return tx.accountCategory.create({ data: { name: PRODUCTS_CATEGORY_NAME } });
}

async function generateNextAccountCodeInTx(tx: Prisma.TransactionClient): Promise<string> {
  const accounts = await tx.account.findMany({ select: { code: true } });
  let max = 0;
  for (const { code } of accounts) {
    if (!/^\d+$/.test(code)) continue;
    const num = parseInt(code, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return String(max + 1);
}

export async function listProducts() {
  return prisma.product.findMany({
    where: { isActive: true },
    include: { account: { include: { ledger: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createProduct(data: { name: string; unit?: string; code?: string }) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Product name is required');

  const existing = await prisma.product.findFirst({
    where: { isActive: true, name },
  });
  if (existing) throw new AppError(400, `Product "${name}" already exists`);

  return prisma.$transaction(async (tx) => {
    const category = await ensureProductsCategoryInTx(tx);
    const code = data.code?.trim() || `P${String((await tx.product.count()) + 1).padStart(4, '0')}`;

    const codeTaken = await tx.account.findFirst({ where: { code } });
    if (codeTaken) throw new AppError(400, `Account code "${code}" already exists`);

    const account = await tx.account.create({
      data: {
        categoryId: category.id,
        name,
        code,
        type: AccountType.ASSET,
      },
    });

    await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });

    const product = await tx.product.create({
      data: {
        name,
        code,
        unit: data.unit?.trim() || null,
        accountId: account.id,
      },
      include: { account: { include: { ledger: true } } },
    });

    return product;
  });
}

export async function removeProduct(id: number) {
  const product = await prisma.product.findFirst({
    where: { id, isActive: true },
    include: { account: { include: { ledger: true } } },
  });
  if (!product) throw new AppError(404, 'Product not found');

  const balance = product.account.ledger ? Number(product.account.ledger.balance) : 0;
  if (Math.abs(balance) > 0.005) {
    throw new AppError(400, 'Product ledger has a balance and cannot be removed');
  }

  return prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { isActive: false } });
    await tx.account.update({ where: { id: product.accountId }, data: { isActive: false } });
    return { ok: true };
  });
}
