import { AccountType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { postOpeningBalanceForLedger } from '../accounting/accounting.service';
import {
  ensureMaalKhataCategoryInTx,
  generateNextMaalKhataCodeInTx,
  maalKhataAccountName,
} from './maal-khata';

export { MAAL_KHATA_CATEGORY_NAME, maalKhataAccountName } from './maal-khata';

export async function listProducts() {
  return prisma.product.findMany({
    where: { isActive: true },
    include: { account: { include: { ledger: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createProduct(data: {
  name: string;
  unit?: string;
  code?: string;
  openingBalance?: number;
  openingBalanceSide?: 'DR' | 'CR';
}) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Product name is required');

  const existing = await prisma.product.findFirst({
    where: { isActive: true, name },
  });
  if (existing) throw new AppError(400, `Product "${name}" already exists`);

  const amount = Math.abs(Number(data.openingBalance ?? 0));
  if (amount > 0 && data.openingBalanceSide !== 'DR' && data.openingBalanceSide !== 'CR') {
    throw new AppError(400, 'Opening balance requires Debit or Credit selection');
  }
  const side = data.openingBalanceSide ?? 'DR';

  return prisma.$transaction(async (tx) => {
    const category = await ensureMaalKhataCategoryInTx(tx);
    const accountName = maalKhataAccountName(name);
    const code = data.code?.trim() || (await generateNextMaalKhataCodeInTx(tx));

    const codeTaken = await tx.account.findFirst({ where: { code } });
    if (codeTaken) throw new AppError(400, `Account code "${code}" already exists`);

    const nameTaken = await tx.account.findFirst({
      where: { isActive: true, name: accountName, categoryId: category.id },
    });
    if (nameTaken) throw new AppError(400, `Maal Khata ledger "${accountName}" already exists`);

    const account = await tx.account.create({
      data: {
        categoryId: category.id,
        name: accountName,
        code,
        type: AccountType.ASSET,
      },
    });

    const ledger = await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });

    if (amount > 0) {
      await postOpeningBalanceForLedger(tx, {
        ledgerId: ledger.id,
        accountName,
        amount,
        side,
      });
    }

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
