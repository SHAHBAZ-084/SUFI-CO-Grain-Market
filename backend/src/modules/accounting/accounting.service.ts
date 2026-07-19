import { AccountType, FinancialYearStatus, LedgerEntryType, Prisma, VoucherStatus, VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

type DbClient = Prisma.TransactionClient | typeof prisma;

export function fiscalYearLabelForDate(date: Date): { label: string; startDate: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 6) {
    return { label: `${year}-${year + 1}`, startDate: new Date(year, 6, 1) };
  }
  return { label: `${year - 1}-${year}`, startDate: new Date(year - 1, 6, 1) };
}

function nextFiscalYearLabel(label: string): string {
  const startYear = parseInt(label.split('-')[0] ?? '', 10);
  if (!Number.isFinite(startYear)) {
    throw new AppError(500, 'Invalid financial year label');
  }
  return `${startYear + 1}-${startYear + 2}`;
}

export async function getActiveFinancialYearId(db: DbClient): Promise<number> {
  const year = await db.financialYear.findFirst({
    where: { status: FinancialYearStatus.ACTIVE },
    select: { id: true },
  });
  if (!year) throw new AppError(400, 'No active financial year');
  return year.id;
}

export async function assertActiveFinancialYear(
  db: DbClient,
  financialYearId: number | null | undefined,
): Promise<void> {
  const activeId = await getActiveFinancialYearId(db);
  if (financialYearId == null || financialYearId !== activeId) {
    throw new AppError(
      403,
      'This record belongs to a closed financial year and can no longer be edited or deleted.',
    );
  }
}

async function getOpeningBalanceSnapshot(
  db: DbClient,
  accountId: number,
  financialYearId: number,
): Promise<{ balance: number; priorYearLabel: string | null }> {
  const currentYear = await db.financialYear.findFirst({
    where: { id: financialYearId },
  });
  if (!currentYear) return { balance: 0, priorYearLabel: null };

  const priorYear = await db.financialYear.findFirst({
    where: { startDate: { lt: currentYear.startDate } },
    orderBy: { startDate: 'desc' },
    select: { id: true, label: true },
  });
  if (!priorYear) return { balance: 0, priorYearLabel: null };

  const snapshot = await db.financialYearClosingBalance.findUnique({
    where: {
      financialYearId_accountId: {
        financialYearId: priorYear.id,
        accountId,
      },
    },
  });
  return {
    balance: snapshot ? Number(snapshot.balance) : 0,
    priorYearLabel: priorYear.label,
  };
}

export async function listFinancialYears() {
  return prisma.financialYear.findMany({
    where: {},
    orderBy: { startDate: 'desc' },
    include: {
      closedBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}

export async function closeFinancialYear(userId: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const activeYear = await tx.financialYear.findFirst({
      where: { status: FinancialYearStatus.ACTIVE },
    });
    if (!activeYear) throw new AppError(400, 'No active financial year to close');

    const accounts = await tx.account.findMany({
      where: {},
      include: { ledger: true },
    });

    for (const account of accounts) {
      const balance = account.ledger ? Number(account.ledger.balance) : 0;
      await tx.financialYearClosingBalance.create({
        data: {
          financialYearId: activeYear.id,
          accountId: account.id,
          balance,
        },
      });
    }

    const endDate = new Date();
    const closedYear = await tx.financialYear.update({
      where: { id: activeYear.id },
      data: {
        status: FinancialYearStatus.CLOSED,
        closedAt: endDate,
        closedById: userId,
        endDate,
      },
    });

    const nextStart = new Date(endDate);
    nextStart.setDate(nextStart.getDate() + 1);
    nextStart.setHours(0, 0, 0, 0);

    const newYear = await tx.financialYear.create({
      data: {
        label: nextFiscalYearLabel(activeYear.label),
        startDate: nextStart,
        status: FinancialYearStatus.ACTIVE,
      },
    });

    return { closedYear, newYear };
  });
}

function isBankOrCashCategory(name: string) {
  const n = name.trim().toLowerCase();
  return n.includes('bank') || n.includes('cash');
}

async function loadAccounts(
  tx: Prisma.TransactionClient,
  debitAccountId: number,
  creditAccountId: number,
) {
  if (debitAccountId === creditAccountId) {
    throw new AppError(400, 'Debit and credit accounts must be different');
  }

  const [debitAccount, creditAccount] = await Promise.all([
    tx.account.findFirst({
      where: { id: debitAccountId, isActive: true },
      include: { category: true },
    }),
    tx.account.findFirst({
      where: { id: creditAccountId, isActive: true },
      include: { category: true },
    }),
  ]);

  if (!debitAccount || !creditAccount) {
    throw new AppError(400, 'One or both accounts are invalid');
  }

  return { debitAccount, creditAccount };
}

function assertVoucherAccountRules(
  type: VoucherType,
  debitAccount: { category: { name: string } },
  creditAccount: { category: { name: string } },
) {
  if (type === 'RECEIPT' && !isBankOrCashCategory(debitAccount.category.name)) {
    throw new AppError(400, 'Receipt must debit a Bank or Cash account (To side)');
  }
  if (type === 'PAYMENT' && !isBankOrCashCategory(creditAccount.category.name)) {
    throw new AppError(400, 'Payment must credit a Bank or Cash account (From side)');
  }
}

export const CUSTOMERS_CATEGORY_NAME = 'Customers';

export function isCustomersCategoryName(name: string) {
  return name.trim().toLowerCase() === CUSTOMERS_CATEGORY_NAME.toLowerCase();
}

export async function ensureCustomersCategory() {
  const existing = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: { equals: CUSTOMERS_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return prisma.accountCategory.create({ data: { name: CUSTOMERS_CATEGORY_NAME } });
}

export const SUPPLIERS_CATEGORY_NAME = 'Suppliers';

export const INCOME_CATEGORY_NAME = 'Income';
export const SALE_REVENUE_ACCOUNT_NAME = 'Sale Revenue';
export const SERVICE_REVENUE_ACCOUNT_NAME = 'Service Revenue';
export const INVENTORY_CATEGORY_NAME = 'Inventory';
export const INVENTORY_ACCOUNT_NAME = 'Inventory';
export const CASH_IN_HAND_ACCOUNT_NAME = 'Cash in Hand';

export const DEFAULT_CATEGORY_NAMES = [
  'Assets',
  'Cash',
  'Bank',
  CUSTOMERS_CATEGORY_NAME,
  SUPPLIERS_CATEGORY_NAME,
  INVENTORY_CATEGORY_NAME,
  INCOME_CATEGORY_NAME,
  'Expenses',
  'Capital',
] as const;

export function isSuppliersCategoryName(name: string) {
  return name.trim().toLowerCase() === SUPPLIERS_CATEGORY_NAME.toLowerCase();
}

export function isInventoryCategoryName(name: string) {
  return name.trim().toLowerCase() === INVENTORY_CATEGORY_NAME.toLowerCase();
}

export function isSystemAccountCategoryName(name: string) {
  return (
    isCustomersCategoryName(name)
    || isSuppliersCategoryName(name)
    || isInventoryCategoryName(name)
  );
}

export async function ensureSuppliersCategory() {
  const existing = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: { equals: SUPPLIERS_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return prisma.accountCategory.create({ data: { name: SUPPLIERS_CATEGORY_NAME } });
}

export async function ensureInventoryCategory() {
  const existing = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: { equals: INVENTORY_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return prisma.accountCategory.create({ data: { name: INVENTORY_CATEGORY_NAME } });
}

export async function listAccountCategories() {
  await bootstrapChartOfAccounts();

  const [categories, customerCount, supplierCount, inventoryAccounts] = await Promise.all([
    prisma.accountCategory.findMany({
      where: { isActive: true },
      include: { accounts: { where: { isActive: true }, include: { ledger: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.customer.count({ where: { isActive: true } }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.account.count({
      where: { isActive: true, name: { equals: INVENTORY_ACCOUNT_NAME },
      },
    }),
  ]);

  return categories.map((category) => {
    const isCustomers = isCustomersCategoryName(category.name);
    const isSuppliers = isSuppliersCategoryName(category.name);
    const isInventory = isInventoryCategoryName(category.name);
    return {
      ...category,
      isCustomersCategory: isCustomers,
      isSuppliersCategory: isSuppliers,
      isInventoryCategory: isInventory,
      entryCount: isCustomers
        ? customerCount
        : isSuppliers
          ? supplierCount
          : isInventory
            ? inventoryAccounts
            : category.accounts.length,
    };
  });
}

export async function createAccountCategory(name: string) {
  const trimmedName = await assertUniqueCategoryName(name);
  return prisma.accountCategory.create({ data: { name: trimmedName } });
}

export async function softDeleteAccountCategory(id: number) {
  const category = await prisma.accountCategory.findFirst({
    where: { id, isActive: true },
    include: { accounts: { where: { isActive: true } } },
  });
  if (!category) throw new AppError(404, 'Category not found');

  if (isSystemAccountCategoryName(category.name)) {
    throw new AppError(400, `The ${category.name} category cannot be deleted`);
  }

  if (category.accounts.length > 0) {
    throw new AppError(
      400,
      `Category "${category.name}" has ${category.accounts.length} active account(s) and cannot be deleted`,
    );
  }

  return prisma.accountCategory.update({
    where: { id },
    data: { isActive: false },
  });
}

async function generateNextAccountCode(): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: {},
    select: { code: true },
  });

  let max = 0;
  for (const { code } of accounts) {
    if (!/^\d+$/.test(code)) continue;
    const num = parseInt(code, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return String(max + 1);
}

async function resolveAccountType(
  categoryId: number,
  explicit?: AccountType,
): Promise<AccountType> {
  if (explicit) return explicit;

  const sibling = await prisma.account.findFirst({
    where: { categoryId, isActive: true },
    select: { type: true },
  });
  return sibling?.type ?? AccountType.ASSET;
}

async function generateNextAccountCodeInTx(
  tx: Prisma.TransactionClient,
  ): Promise<string> {
  const accounts = await tx.account.findMany({ where: {}, select: { code: true } });
  let max = 0;
  for (const { code } of accounts) {
    if (!/^\d+$/.test(code)) continue;
    const num = parseInt(code, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return String(max + 1);
}

async function findOrCreateOpeningBalanceEquityAccount(
  tx: Prisma.TransactionClient,
  ) {
  const existing = await tx.account.findFirst({
    where: { isActive: true,
      type: AccountType.EQUITY,
      name: { equals: 'Opening Balance Equity' },
    },
    include: { ledger: true },
  });
  if (existing?.ledger) return existing;

  let category = await tx.accountCategory.findFirst({
    where: { isActive: true,
      name: { equals: 'Capital' },
    },
  });
  if (!category) {
    category = await tx.accountCategory.create({
      data: { name: 'Capital' },
    });
  }

  const account = await tx.account.create({
    data: { categoryId: category.id,
      name: 'Opening Balance Equity',
      code: await generateNextAccountCodeInTx(tx),
      type: AccountType.EQUITY,
    },
  });

  const ledger = await tx.ledger.create({
    data: { accountId: account.id, balance: 0 },
  });

  return tx.account.findUniqueOrThrow({
    where: { id: account.id },
    include: { ledger: true },
  });
}

async function postOpeningBalanceOffset(
  tx: Prisma.TransactionClient,
  accountName: string,
  amount: number,
  side: 'DR' | 'CR',
) {
  const equityAccount = await findOrCreateOpeningBalanceEquityAccount(tx);
  const equityLedger = equityAccount.ledger!;
  const offsetType = side === 'DR' ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT;
  const offsetBalance = Number(equityLedger.balance) + (side === 'DR' ? -amount : amount);

  await tx.ledgerEntry.create({
    data: {
      ledgerId: equityLedger.id,
      type: offsetType,
      amount,
      balance: offsetBalance,
      notes: `Opening Balance — offset for ${accountName}`,
      isOpeningBalance: true,
    },
  });
  await tx.ledger.update({
    where: { id: equityLedger.id },
    data: { balance: offsetBalance },
  });
}

export async function createAccount(data: {
  categoryId: number;
  name: string;
  code?: string;
  type?: AccountType;
  openingBalance?: number;
  openingBalanceSide?: 'DR' | 'CR';
}) {
  const trimmedName = await assertUniqueAccountName(data.name);

  if (isInventoryAccountName(trimmedName)) {
    throw new AppError(
      400,
      'The Inventory account is managed automatically under the Inventory category',
    );
  }

  const category = await prisma.accountCategory.findFirst({
    where: { id: data.categoryId, isActive: true },
  });
  if (!category) throw new AppError(400, 'Invalid category');

  if (isCustomersCategoryName(category.name) || isSuppliersCategoryName(category.name)) {
    throw new AppError(
      400,
      'Customer and supplier accounts are created from the Customers and Suppliers menus',
    );
  }

  const type = await resolveAccountType(data.categoryId, data.type);
  const trimmedCode = data.code
    ? await assertUniqueAccountCode(data.code)
    : await generateNextAccountCode();

  const amount = Math.abs(data.openingBalance ?? 0);
  const side = data.openingBalanceSide ?? defaultOpeningSide(type);
  const signedBalance = amount === 0 ? 0 : side === 'DR' ? amount : -amount;

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const account = await tx.account.create({
      data: {
        categoryId: data.categoryId,
        name: trimmedName,
        code: trimmedCode,
        type,
      },
    });

    const ledger = await tx.ledger.create({
      data: { accountId: account.id, balance: signedBalance },
    });

    if (amount > 0 && trimmedName.toLowerCase() !== 'opening balance equity') {
      await tx.ledgerEntry.create({
        data: {
          ledgerId: ledger.id,
          type: side === 'DR' ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
          amount,
          balance: signedBalance,
          notes: 'Opening Balance',
          isOpeningBalance: true,
        },
      });
      await postOpeningBalanceOffset(tx, trimmedName, amount, side);
    }

    return tx.account.findUniqueOrThrow({
      where: { id: account.id },
      include: { category: true, ledger: true },
    });
  });
}

function defaultOpeningSide(type: AccountType): 'DR' | 'CR' {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DR' : 'CR';
}

function normalizeLabel(value: string) {
  return value.trim();
}

async function assertUniqueCategoryName(name: string) {
  const trimmed = normalizeLabel(name);
  if (!trimmed) throw new AppError(400, 'Category name is required');

  const existing = await prisma.accountCategory.findFirst({
    where: { isActive: true, name: { equals: trimmed } },
  });
  if (existing) {
    throw new AppError(400, `Category "${existing.name}" already exists`);
  }
  return trimmed;
}

async function assertUniqueAccountName(name: string) {
  const trimmed = normalizeLabel(name);
  if (!trimmed) throw new AppError(400, 'Account name is required');

  const existing = await prisma.account.findFirst({
    where: { name: { equals: trimmed } },
  });
  if (existing) {
    throw new AppError(400, `Account "${existing.name}" already exists`);
  }
  return trimmed;
}

async function assertUniqueAccountCode(code: string) {
  const trimmed = normalizeLabel(code);
  if (!trimmed) throw new AppError(400, 'Account code is required');

  const existing = await prisma.account.findFirst({
    where: { code: { equals: trimmed } },
  });
  if (existing) {
    throw new AppError(400, `Account code "${existing.code}" already exists`);
  }
  return trimmed;
}

function isSaleRevenueAccountName(name?: string | null) {
  return name?.trim().toLowerCase() === SALE_REVENUE_ACCOUNT_NAME.toLowerCase();
}

function isInventoryAccountName(name?: string | null) {
  return name?.trim().toLowerCase() === INVENTORY_ACCOUNT_NAME.toLowerCase();
}

function isSaleVoucher(voucher: {
  type?: VoucherType | null;
  creditAccount?: { name: string } | null;
  debitAccount?: { name: string } | null;
} | null) {
  if (!voucher || voucher.type !== VoucherType.JOURNAL) return false;
  return isSaleRevenueAccountName(voucher.creditAccount?.name) && !!voucher.debitAccount?.name;
}

function isPurchaseVoucher(voucher: {
  type?: VoucherType | null;
  creditAccount?: { name: string } | null;
  debitAccount?: { name: string } | null;
} | null) {
  if (!voucher || voucher.type !== VoucherType.JOURNAL) return false;
  return (
    isInventoryAccountName(voucher.debitAccount?.name)
    && !!voucher.creditAccount?.name
    && !isSaleRevenueAccountName(voucher.creditAccount?.name)
  );
}

function voucherTypeLabel(
  voucher: {
    type?: VoucherType | null;
    creditAccount?: { name: string } | null;
    debitAccount?: { name: string } | null;
  } | null,
  isReversal: boolean,
) {
  if (isSaleVoucher(voucher)) {
    return isReversal ? 'Sale (Reversal)' : 'Sale';
  }
  if (isPurchaseVoucher(voucher)) {
    return isReversal ? 'Purchase (Reversal)' : 'Purchase';
  }
  const type = voucher?.type;
  if (!type) return isReversal ? 'Journal (Reversal)' : 'Journal';
  const base =
    type === 'PAYMENT' ? 'Payment'
      : type === 'RECEIPT' ? 'Receipt'
        : 'Journal';
  return isReversal ? `${base} (Reversal)` : base;
}

function voucherDisplayNo(_type: VoucherType | null | undefined, number: number | null | undefined) {
  if (!number) return '0';
  return String(number);
}

export function formatPurchaseItemsDescription(
  items: { quantity: number; product?: { name: string } | null; part?: { name: string } | null }[],
): string {
  if (!items.length) return '';
  return items
    .map((item) => {
      const name = item.product?.name ?? item.part?.name ?? 'Item';
      return `${name} × ${item.quantity}`;
    })
    .join(', ');
}

async function loadPurchaseDescriptionsByRef(_refs: string[]) {
  return new Map<string, string>();
}

async function loadSaleDescriptionsByRef(_refs: string[]) {
  return new Map<string, string>();
}

function buildLedgerEntryDescription(
  e: { isOpeningBalance: boolean; notes?: string | null },
  voucher: {
    type?: VoucherType | null;
    description?: string | null;
    creditAccount?: { name: string } | null;
    debitAccount?: { name: string } | null;
  } | null,
  purchaseSummary?: string,
  saleSummary?: string,
): string {
  if (e.isOpeningBalance) return 'Opening Balance';
  if (!voucher?.creditAccount || !voucher?.debitAccount) {
    return e.notes?.trim() || voucher?.description?.trim() || '';
  }

  if (isSaleVoucher(voucher)) {
    const base = `From sale revenue to ${voucher.debitAccount.name}`;
    return saleSummary ? `${base} — ${saleSummary}` : base;
  }

  if (isPurchaseVoucher(voucher)) {
    const base = `From ${voucher.creditAccount.name} to inventory`;
    return purchaseSummary ? `${base} — ${purchaseSummary}` : base;
  }

  const auto = `From ${voucher.creditAccount.name} to ${voucher.debitAccount.name}`;
  const custom = voucher.description?.trim();
  return custom ? `${auto} — ${custom}` : auto;
}

async function nextVoucherNumber(
  tx: Prisma.TransactionClient,
  type: VoucherType,
  financialYearId: number,
): Promise<number> {
  const { _max } = await tx.voucher.aggregate({
    where: { type, financialYearId },
    _max: { number: true },
  });
  return (_max.number ?? 0) + 1;
}

function parseDateStart(value: string) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateEnd(value: string) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function entryDebitCredit(type: LedgerEntryType, amount: number) {
  if (type === LedgerEntryType.DEBIT) return { debit: amount, credit: 0 };
  return { debit: 0, credit: amount };
}

/** Reversal rows and cancelled vouchers are bookkeeping only — omit from reports. */
function isReportableLedgerEntry(e: {
  isReversal: boolean;
  voucher: { status: VoucherStatus } | null;
}) {
  if (e.isReversal) return false;
  if (e.voucher?.status === VoucherStatus.CANCELLED) return false;
  return true;
}

function reportBalanceFromEntries(
  entries: { type: LedgerEntryType; amount: number | Prisma.Decimal; isReversal: boolean; voucher: { status: VoucherStatus } | null }[],
) {
  return entries
    .filter(isReportableLedgerEntry)
    .reduce((sum, e) => {
      const { debit, credit } = entryDebitCredit(e.type, Number(e.amount));
      return sum + debit - credit;
    }, 0);
}

export async function listAccounts() {
  await prisma.$transaction(async (tx) => {
    await consolidateDuplicateInventoryAccounts(tx);
    await syncCustomerSupplierAccountsInTx(tx);
  });

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: { category: true, ledger: true },
    orderBy: { code: 'asc' },
  });

  return accounts.map(({ ledger, ...account }) => ({
    ...account,
    ledger: ledger
      ? { ...ledger, balance: Number(ledger.balance) }
      : null,
  }));
}

async function ensureCustomersCategoryInTx(tx: Prisma.TransactionClient) {
  const existing = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: CUSTOMERS_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return tx.accountCategory.create({ data: { name: CUSTOMERS_CATEGORY_NAME } });
}

export async function ensureSaleRevenueAccount(tx: Prisma.TransactionClient) {
  let category = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: INCOME_CATEGORY_NAME } },
  });
  if (!category) {
    category = await tx.accountCategory.create({ data: { name: INCOME_CATEGORY_NAME } });
  }

  const existing = await tx.account.findFirst({
    where: { isActive: true, categoryId: category.id,
      name: { equals: SALE_REVENUE_ACCOUNT_NAME },
    },
    include: { ledger: true },
  });
  if (existing?.ledger) return existing;

  const account = await tx.account.create({
    data: { categoryId: category.id,
      name: SALE_REVENUE_ACCOUNT_NAME,
      code: await generateNextAccountCodeInTx(tx),
      type: AccountType.REVENUE,
    },
  });
  await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { ledger: true } });
}

export async function ensureServiceRevenueAccount(tx: Prisma.TransactionClient) {
  let category = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: INCOME_CATEGORY_NAME } },
  });
  if (!category) {
    category = await tx.accountCategory.create({ data: { name: INCOME_CATEGORY_NAME } });
  }

  const existing = await tx.account.findFirst({
    where: { isActive: true, categoryId: category.id,
      name: { equals: SERVICE_REVENUE_ACCOUNT_NAME },
    },
    include: { ledger: true },
  });
  if (existing?.ledger) return existing;

  const account = await tx.account.create({
    data: { categoryId: category.id,
      name: SERVICE_REVENUE_ACCOUNT_NAME,
      code: await generateNextAccountCodeInTx(tx),
      type: AccountType.REVENUE,
    },
  });
  await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { ledger: true } });
}

export async function ensureCustomerAccount(
  tx: Prisma.TransactionClient,
  customer: { id: number; name: string },
) {
  const category = await ensureCustomersCategoryInTx(tx);
  const code = `C${String(customer.id).padStart(4, '0')}`;

  const existing = await tx.account.findFirst({
    where: { isActive: true, code },
    include: { ledger: true },
  });
  if (existing) {
    if (!existing.ledger) {
      await tx.ledger.create({ data: { accountId: existing.id, balance: 0 } });
    }
    if (existing.name !== customer.name) {
      await tx.account.update({ where: { id: existing.id }, data: { name: customer.name } });
    }
    return tx.account.findUniqueOrThrow({ where: { id: existing.id }, include: { ledger: true } });
  }

  const account = await tx.account.create({
    data: { categoryId: category.id,
      name: customer.name,
      code,
      type: AccountType.ASSET,
    },
  });
  await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { ledger: true } });
}

async function ensureSuppliersCategoryInTx(tx: Prisma.TransactionClient) {
  const existing = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: SUPPLIERS_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return tx.accountCategory.create({ data: { name: SUPPLIERS_CATEGORY_NAME } });
}

export async function ensureSupplierAccount(
  tx: Prisma.TransactionClient,
  supplier: { id: number; name: string },
) {
  const category = await ensureSuppliersCategoryInTx(tx);
  const code = `S${String(supplier.id).padStart(4, '0')}`;

  const existing = await tx.account.findFirst({
    where: { isActive: true, code },
    include: { ledger: true },
  });
  if (existing) {
    if (!existing.ledger) {
      await tx.ledger.create({ data: { accountId: existing.id, balance: 0 } });
    }
    if (existing.name !== supplier.name) {
      await tx.account.update({ where: { id: existing.id }, data: { name: supplier.name } });
    }
    return tx.account.findUniqueOrThrow({ where: { id: existing.id }, include: { ledger: true } });
  }

  const account = await tx.account.create({
    data: { categoryId: category.id,
      name: supplier.name,
      code,
      type: AccountType.LIABILITY,
    },
  });
  await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { ledger: true } });
}

async function syncCustomerSupplierAccountsInTx(tx: Prisma.TransactionClient) {
  const [customers, suppliers] = await Promise.all([
    tx.customer.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    tx.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  for (const customer of customers) {
    await ensureCustomerAccount(tx, customer);
  }
  for (const supplier of suppliers) {
    await ensureSupplierAccount(tx, supplier);
  }
}

export async function syncCustomerSupplierAccounts() {
  await prisma.$transaction(async (tx) => {
    await syncCustomerSupplierAccountsInTx(tx);
  });
}

export async function ensureInventoryAccount(tx: Prisma.TransactionClient) {
  const category = await ensureInventoryCategoryInTx(tx);

  const allNamed = await tx.account.findMany({
    where: { isActive: true, name: { equals: INVENTORY_ACCOUNT_NAME },
    },
    include: { ledger: true },
    orderBy: { id: 'asc' },
  });

  let canonical =
    allNamed.find((a) => a.categoryId === category.id && a.ledger) ??
    allNamed.find((a) => a.categoryId === category.id) ??
    allNamed.find((a) => a.ledger) ??
    allNamed[0] ??
    null;

  if (canonical && canonical.categoryId !== category.id) {
    canonical = await tx.account.update({
      where: { id: canonical.id },
      data: { categoryId: category.id, type: AccountType.ASSET },
      include: { ledger: true },
    });
  }

  if (canonical && !canonical.ledger) {
    await tx.ledger.create({ data: { accountId: canonical.id, balance: 0 } });
    canonical = await tx.account.findUniqueOrThrow({
      where: { id: canonical.id },
      include: { ledger: true },
    });
  }

  if (!canonical) {
    const account = await tx.account.create({
      data: { categoryId: category.id,
        name: INVENTORY_ACCOUNT_NAME,
        code: await generateNextAccountCodeInTx(tx),
        type: AccountType.ASSET,
      },
    });
    await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
    return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { ledger: true } });
  }

  return canonical;
}

async function mergeInventoryAccountIntoCanonical(
  tx: Prisma.TransactionClient,
  canonical: { id: number; ledger: { id: number } | null },
  duplicate: { id: number; ledger: { id: number; balance: unknown } | null },
) {
  if (duplicate.id === canonical.id) return;

  if (duplicate.ledger) {
    await tx.ledgerEntry.updateMany({
      where: { ledgerId: duplicate.ledger.id },
      data: { ledgerId: canonical.ledger!.id },
    });

    await tx.voucher.updateMany({
      where: { debitAccountId: duplicate.id },
      data: { debitAccountId: canonical.id },
    });
    await tx.voucher.updateMany({
      where: { creditAccountId: duplicate.id },
      data: { creditAccountId: canonical.id },
    });

    const entries = await tx.ledgerEntry.findMany({
      where: { ledgerId: canonical.ledger!.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let balance = 0;
    for (const entry of entries) {
      balance +=
        entry.type === LedgerEntryType.DEBIT ? Number(entry.amount) : -Number(entry.amount);
      await tx.ledgerEntry.update({ where: { id: entry.id }, data: { balance } });
    }

    await tx.ledger.update({
      where: { id: canonical.ledger!.id },
      data: { balance },
    });

    await tx.ledger.update({
      where: { id: duplicate.ledger.id },
      data: { balance: 0 },
    });
  }

  await tx.account.update({
    where: { id: duplicate.id },
    data: { isActive: false },
  });
}

/** Keep a single Inventory account under the Inventory category; merge/remove duplicates. */
export async function consolidateDuplicateInventoryAccounts(
  tx: Prisma.TransactionClient,
  ) {
  const canonical = await ensureInventoryAccount(tx);

  const duplicates = await tx.account.findMany({
    where: { isActive: true,
      id: { not: canonical.id },
      name: { equals: INVENTORY_ACCOUNT_NAME },
    },
    include: { ledger: true },
  });

  for (const dup of duplicates) {
    await mergeInventoryAccountIntoCanonical(tx, canonical, dup);
  }

  return canonical;
}

async function ensureCategoryInTx(tx: Prisma.TransactionClient, name: string) {
  const existing = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: name } },
  });
  if (existing) return existing;
  return tx.accountCategory.create({ data: { name } });
}

async function ensureDefaultAccountInTx(
  tx: Prisma.TransactionClient,
  categoryId: number,
  accountName: string,
  type: AccountType,
  preferredCode?: string,
) {
  const existing = await tx.account.findFirst({
    where: { isActive: true,
      name: { equals: accountName },
    },
    include: { ledger: true },
  });

  if (existing) {
    if (!existing.ledger) {
      await tx.ledger.create({ data: { accountId: existing.id, balance: 0 } });
    }
    if (existing.categoryId !== categoryId) {
      await tx.account.update({
        where: { id: existing.id },
        data: { categoryId, type },
      });
    }
    return existing;
  }

  let code = preferredCode;
  if (code) {
    const codeTaken = await tx.account.findFirst({ where: { code } });
    if (codeTaken) code = undefined;
  }
  if (!code) code = await generateNextAccountCodeInTx(tx);

  const account = await tx.account.create({
    data: { categoryId, name: accountName, code, type },
  });
  await tx.ledger.create({ data: { accountId: account.id, balance: 0 } });
  return account;
}

async function consolidateDuplicateInventoryCategories(tx: Prisma.TransactionClient) {
  const categories = await tx.accountCategory.findMany({
    where: { isActive: true,
      name: { equals: INVENTORY_CATEGORY_NAME },
    },
    include: { accounts: { where: { isActive: true } } },
    orderBy: { id: 'asc' },
  });

  if (categories.length <= 1) return categories[0] ?? null;

  const [canonical, ...duplicates] = categories;
  for (const dup of duplicates) {
    for (const account of dup.accounts) {
      await tx.account.update({
        where: { id: account.id },
        data: { categoryId: canonical.id, type: AccountType.ASSET },
      });
    }
    await tx.accountCategory.update({ where: { id: dup.id }, data: { isActive: false } });
  }
  return canonical;
}

/** Create default chart-of-accounts categories and core accounts for a branch. Idempotent. */
export async function bootstrapChartOfAccounts() {
  await prisma.$transaction(async (tx) => {
    for (const name of DEFAULT_CATEGORY_NAMES) {
      await ensureCategoryInTx(tx, name);
    }

    await consolidateDuplicateInventoryCategories(tx);

    const cashCategory = await ensureCategoryInTx(tx, 'Cash');
    await ensureDefaultAccountInTx(
  tx,
      cashCategory.id,
      CASH_IN_HAND_ACCOUNT_NAME,
      AccountType.ASSET,
      '1',
    );

    await ensureInventoryAccount(tx);
    await ensureSaleRevenueAccount(tx);
    await ensureServiceRevenueAccount(tx);
    await consolidateDuplicateInventoryAccounts(tx);
  });
}

async function ensureInventoryCategoryInTx(tx: Prisma.TransactionClient) {
  const existing = await tx.accountCategory.findFirst({
    where: { isActive: true, name: { equals: INVENTORY_CATEGORY_NAME } },
  });
  if (existing) return existing;
  return tx.accountCategory.create({ data: { name: INVENTORY_CATEGORY_NAME } });
}

export async function createVoucherInTx(
  tx: Prisma.TransactionClient,
  data: {
    type: VoucherType;
    debitAccountId: number;
    creditAccountId: number;
    amount: number;
    description?: string;
    reference?: string;
    createdById: number;
  },
) {
  if (data.amount <= 0) {
    throw new AppError(400, 'Amount must be greater than zero');
  }

  const { debitAccount, creditAccount } = await loadAccounts(
    tx,
    data.debitAccountId,
    data.creditAccountId,
  );
  assertVoucherAccountRules(data.type, debitAccount, creditAccount);

  const financialYearId = await getActiveFinancialYearId(tx);
  const number = await nextVoucherNumber(tx, data.type, financialYearId);

  const voucher = await tx.voucher.create({
    data: { ...data, number, financialYearId, status: VoucherStatus.ACTIVE },
  });

  await postVoucherLedgerEntries(
    tx,
    voucher.id,
    data.debitAccountId,
    data.creditAccountId,
    data.amount,
    data.description,
    false,
  );

  return voucher;
}

export async function createVoucher(data: {
  type: VoucherType;
  debitAccountId: number;
  creditAccountId: number;
  amount: number;
  description?: string;
  reference?: string;
  createdById: number;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const voucher = await createVoucherInTx(tx, data);
    return tx.voucher.findUniqueOrThrow({ where: { id: voucher.id }, include: voucherInclude });
  });
}

async function postVoucherLedgerEntries(
  tx: Prisma.TransactionClient,
  voucherId: number,
  debitAccountId: number,
  creditAccountId: number,
  amount: number,
  notes: string | null | undefined,
  isReversal: boolean,
) {
  const debitLedger = await tx.ledger.findUniqueOrThrow({ where: { accountId: debitAccountId } });
  const creditLedger = await tx.ledger.findUniqueOrThrow({ where: { accountId: creditAccountId } });

  const debitBalance = Number(debitLedger.balance) + amount;
  const creditBalance = Number(creditLedger.balance) - amount;

  await tx.ledgerEntry.createMany({
    data: [
      {
        ledgerId: debitLedger.id,
        voucherId,
        type: LedgerEntryType.DEBIT,
        amount,
        balance: debitBalance,
        notes: notes ?? undefined,
        isReversal,
      },
      {
        ledgerId: creditLedger.id,
        voucherId,
        type: LedgerEntryType.CREDIT,
        amount,
        balance: creditBalance,
        notes: notes ?? undefined,
        isReversal,
      },
    ],
  });

  await tx.ledger.update({ where: { id: debitLedger.id }, data: { balance: debitBalance } });
  await tx.ledger.update({ where: { id: creditLedger.id }, data: { balance: creditBalance } });
}

async function reverseVoucherLedgerEntries(
  tx: Prisma.TransactionClient,
  voucher: { id: number; debitAccountId: number; creditAccountId: number; amount: Prisma.Decimal },
  notes: string,
) {
  const amount = Number(voucher.amount);

  const debitLedger = await tx.ledger.findUniqueOrThrow({
    where: { accountId: voucher.debitAccountId },
  });
  const creditLedger = await tx.ledger.findUniqueOrThrow({
    where: { accountId: voucher.creditAccountId },
  });

  const debitBalanceAfter = Number(debitLedger.balance) - amount;
  await tx.ledgerEntry.create({
    data: {
      ledgerId: debitLedger.id,
      voucherId: voucher.id,
      type: LedgerEntryType.CREDIT,
      amount,
      balance: debitBalanceAfter,
      notes,
      isReversal: true,
    },
  });
  await tx.ledger.update({ where: { id: debitLedger.id }, data: { balance: debitBalanceAfter } });

  const creditBalanceAfter = Number(creditLedger.balance) + amount;
  await tx.ledgerEntry.create({
    data: {
      ledgerId: creditLedger.id,
      voucherId: voucher.id,
      type: LedgerEntryType.DEBIT,
      amount,
      balance: creditBalanceAfter,
      notes,
      isReversal: true,
    },
  });
  await tx.ledger.update({ where: { id: creditLedger.id }, data: { balance: creditBalanceAfter } });
}

const voucherInclude = {
  debitAccount: true,
  creditAccount: true,
  createdBy: { select: { id: true, displayName: true, username: true } },
  modifiedBy: { select: { id: true, displayName: true, username: true } },
  deletedBy: { select: { id: true, displayName: true, username: true } },
} as const;

export async function listVouchers() {
  let financialYearId: number | undefined;
  try {
    financialYearId = await getActiveFinancialYearId(prisma);
  } catch {
    financialYearId = undefined;
  }

  return prisma.voucher.findMany({
    where: { ...(financialYearId != null && { financialYearId }),
    },
    include: voucherInclude,
    orderBy: { createdAt: 'desc' },
  });
}

async function shiftSubsequentEntryBalances(
  tx: Prisma.TransactionClient,
  ledgerId: number,
  afterEntryId: number,
  shift: number,
) {
  if (shift === 0) return;
  await tx.ledgerEntry.updateMany({
    where: { ledgerId, id: { gt: afterEntryId } },
    data: { balance: { increment: shift } },
  });
}

export async function updateVoucherAmount(
  voucherId: number,
  newAmount: number,
  userId: number,
) {
  if (newAmount <= 0) {
    throw new AppError(400, 'Amount must be greater than zero');
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const voucher = await tx.voucher.findFirst({
      where: { id: voucherId },
    });
    if (!voucher) throw new AppError(404, 'Voucher not found');
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new AppError(400, 'Cannot update amount on a cancelled voucher');
    }
    await assertActiveFinancialYear(tx, voucher.financialYearId);

    const oldAmount = Number(voucher.amount);
    const delta = newAmount - oldAmount;
    if (Math.abs(delta) < 0.005) {
      return tx.voucher.findUniqueOrThrow({ where: { id: voucher.id }, include: voucherInclude });
    }

    const entries = await tx.ledgerEntry.findMany({
      where: { voucherId: voucher.id, isReversal: false },
      orderBy: { id: 'asc' },
    });

    if (entries.length !== 2) {
      throw new AppError(400, 'Voucher ledger entries are invalid for amount update');
    }

    const debitEntry = entries.find((e) => e.type === LedgerEntryType.DEBIT);
    const creditEntry = entries.find((e) => e.type === LedgerEntryType.CREDIT);
    if (!debitEntry || !creditEntry) {
      throw new AppError(400, 'Voucher ledger entries are invalid for amount update');
    }

    await tx.ledgerEntry.update({
      where: { id: debitEntry.id },
      data: {
        amount: newAmount,
        balance: Number(debitEntry.balance) + delta,
      },
    });
    await tx.ledgerEntry.update({
      where: { id: creditEntry.id },
      data: {
        amount: newAmount,
        balance: Number(creditEntry.balance) - delta,
      },
    });

    await shiftSubsequentEntryBalances(tx, debitEntry.ledgerId, debitEntry.id, delta);
    await shiftSubsequentEntryBalances(tx, creditEntry.ledgerId, creditEntry.id, -delta);

    await tx.ledger.update({
      where: { id: debitEntry.ledgerId },
      data: { balance: { increment: delta } },
    });
    await tx.ledger.update({
      where: { id: creditEntry.ledgerId },
      data: { balance: { increment: -delta } },
    });

    return tx.voucher.update({
      where: { id: voucher.id },
      data: { amount: newAmount, modifiedById: userId },
      include: voucherInclude,
    });
  });
}

export async function cancelVoucher(voucherId: number, userId: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    return cancelVoucherInTx(tx, voucherId, userId);
  });
}

export async function cancelVoucherInTx(
  tx: Prisma.TransactionClient,
  voucherId: number,
  userId: number,
) {
  const voucher = await tx.voucher.findFirst({
    where: { id: voucherId },
  });
  if (!voucher) throw new AppError(404, 'Voucher not found');
  if (voucher.status === VoucherStatus.CANCELLED) {
    throw new AppError(400, 'Voucher is already cancelled');
  }
  await assertActiveFinancialYear(tx, voucher.financialYearId);

  await reverseVoucherLedgerEntries(
    tx,
    voucher,
    `Reversal — cancelled voucher #${voucher.number}`,
  );

  const now = new Date();
  return tx.voucher.update({
    where: { id: voucher.id },
    data: {
      status: VoucherStatus.CANCELLED,
      deletedById: userId,
      deletedAt: now,
      modifiedById: userId,
    },
    include: voucherInclude,
  });
}

export async function cancelActiveVouchersByReferenceInTx(
  tx: Prisma.TransactionClient,
  reference: string,
  userId: number,
) {
  const trimmed = reference.trim();
  if (!trimmed) return;

  const vouchers = await tx.voucher.findMany({
    where: { reference: trimmed, status: VoucherStatus.ACTIVE },
    orderBy: { id: 'asc' },
  });

  for (const voucher of vouchers) {
    await cancelVoucherInTx(tx, voucher.id, userId);
  }
}

export async function restoreVoucher(voucherId: number, userId: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const voucher = await tx.voucher.findFirst({
      where: { id: voucherId },
    });
    if (!voucher) throw new AppError(404, 'Voucher not found');
    if (voucher.status !== VoucherStatus.CANCELLED) {
      throw new AppError(400, 'Only cancelled vouchers can be restored');
    }
    await assertActiveFinancialYear(tx, voucher.financialYearId);

    await postVoucherLedgerEntries(
      tx,
      voucher.id,
      voucher.debitAccountId,
      voucher.creditAccountId,
      Number(voucher.amount),
      undefined,
      false,
    );

    return tx.voucher.update({
      where: { id: voucher.id },
      data: {
        status: VoucherStatus.ACTIVE,
        deletedById: null,
        deletedAt: null,
        modifiedById: userId,
      },
      include: voucherInclude,
    });
  });
}

/** @deprecated Use cancelVoucher — kept for route compatibility */
export async function deleteVoucher(voucherId: number, userId: number) {
  return cancelVoucher( voucherId, userId);
}

export async function getTrialBalance() {
  const ledgers = await prisma.ledger.findMany({
    where: {},
    include: { account: true },
    orderBy: [{ account: { type: 'asc' } }, { account: { code: 'asc' } }],
  });

  const accounts = ledgers.map((l: (typeof ledgers)[number]) => {
    const balance = Number(l.balance);
    return {
      accountId: l.accountId,
      accountCode: l.account.code,
      accountName: l.account.name,
      accountType: l.account.type,
      balance,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
    };
  });

  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

  return {
    accounts,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

export async function getLedgerEntries(
  accountId: number,
  fromDate?: string,
  toDate?: string,
) {
  const financialYearId = await getActiveFinancialYearId(prisma);
  return buildLedgerEntriesReport(accountId, financialYearId, fromDate, toDate);
}

export async function getLedgerEntriesForYear(
  accountId: number,
  financialYearId: number,
  fromDate?: string,
  toDate?: string,
) {
  const year = await prisma.financialYear.findFirst({
    where: { id: financialYearId },
  });
  if (!year) throw new AppError(404, 'Financial year not found');
  return buildLedgerEntriesReport(accountId, financialYearId, fromDate, toDate);
}

async function buildLedgerEntriesReport(
  accountId: number,
  financialYearId: number,
  fromDate?: string,
  toDate?: string,
) {
  let ledger = await prisma.ledger.findFirst({
    where: { accountId },
    include: { account: true },
  });

  if (!ledger) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, isActive: true },
    });
    if (!account) throw new AppError(404, 'Ledger not found');
    await prisma.ledger.create({ data: { accountId, balance: 0 } });
    ledger = await prisma.ledger.findFirst({
      where: { accountId },
      include: { account: true },
    });
  }

  if (!ledger) throw new AppError(404, 'Ledger not found');

  const { balance: baseOpening, priorYearLabel } = await getOpeningBalanceSnapshot(
    prisma,
    accountId,
    financialYearId,
  );

  const currentYear = await prisma.financialYear.findFirst({
    where: { id: financialYearId },
    select: { startDate: true },
  });

  const yearEntries = await prisma.ledgerEntry.findMany({
    where: {
      ledgerId: ledger.id,
      isReversal: false,
      voucher: {
        financialYearId,
        status: VoucherStatus.ACTIVE,
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      voucher: { include: { debitAccount: true, creditAccount: true } },
    },
  });

  const from = fromDate ? parseDateStart(fromDate) : null;
  const to = toDate ? parseDateEnd(toDate) : null;

  let periodOpening = baseOpening;
  const periodEntries: typeof yearEntries = [];

  for (const e of yearEntries) {
    const { debit, credit } = entryDebitCredit(e.type, Number(e.amount));
    const at = new Date(e.createdAt);

    if (from && at < from) {
      periodOpening += debit - credit;
      continue;
    }
    if (to && at > to) continue;

    periodEntries.push(e);
  }

  const purchaseRefs = periodEntries
    .map((e) => e.voucher)
    .filter((v): v is NonNullable<typeof v> => Boolean(v && isPurchaseVoucher(v) && v.reference?.trim()))
    .map((v) => v.reference!.trim());
  const saleRefs = periodEntries
    .map((e) => e.voucher)
    .filter((v): v is NonNullable<typeof v> => Boolean(v && isSaleVoucher(v) && v.reference?.trim()))
    .map((v) => v.reference!.trim());
  const [purchaseDescriptions, saleDescriptions] = await Promise.all([
    loadPurchaseDescriptionsByRef( purchaseRefs),
    loadSaleDescriptionsByRef( saleRefs),
  ]);

  type LedgerRow = {
    date: string;
    voucherNo: string;
    ref: string | null;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    isOpeningRow?: boolean;
  };

  const rows: LedgerRow[] = [];
  let running = from ? periodOpening : baseOpening;
  let totalDebit = 0;
  let totalCredit = 0;

  const openingLabel = priorYearLabel
    ? `Closing Balance of ${priorYearLabel}`
    : 'Opening Balance';

  if (priorYearLabel || from) {
    rows.push({
      date: from
        ? fromDate!
        : (currentYear?.startDate.toISOString() ?? new Date().toISOString()),
      voucherNo: '0',
      ref: null,
      type: openingLabel,
      description: openingLabel,
      debit: 0,
      credit: 0,
      balance: from ? periodOpening : baseOpening,
      isOpeningRow: true,
    });
  }

  for (const e of periodEntries) {
    const { debit, credit } = entryDebitCredit(e.type, Number(e.amount));
    running += debit - credit;
    totalDebit += debit;
    totalCredit += credit;

    const voucher = e.voucher;
    const purchaseSummary = voucher?.reference?.trim()
      ? purchaseDescriptions.get(voucher.reference.trim())
      : undefined;
    const saleSummary = voucher?.reference?.trim()
      ? saleDescriptions.get(voucher.reference.trim())
      : undefined;
    rows.push({
      date: e.createdAt.toISOString(),
      voucherNo: e.isOpeningBalance
        ? '0'
        : voucherDisplayNo(voucher?.type ?? null, voucher?.number),
      ref: voucher?.reference ?? null,
      type: e.isOpeningBalance
        ? 'Opening Balance'
        : voucherTypeLabel(voucher ?? null, false),
      description: buildLedgerEntryDescription(e, voucher ?? null, purchaseSummary, saleSummary),
      debit,
      credit,
      balance: running,
    });
  }

  const closingBalance = from || to
    ? running
    : baseOpening + yearEntries.reduce((sum, e) => {
        const { debit, credit } = entryDebitCredit(e.type, Number(e.amount));
        return sum + debit - credit;
      }, 0);

  return {
    account: ledger.account,
    balance: closingBalance,
    rows,
    summary: {
      periodOpening: from ? periodOpening : baseOpening,
      totalDebit,
      totalCredit,
      closingBalance,
    },
  };
}

export async function approveTrialBalance(data: {
  period: string;
  approvedById: number;
  notes?: string;
}) {
  const snapshot = await getTrialBalance();
  return prisma.trialBalanceApproval.upsert({
    where: { period: data.period },
    create: {
      period: data.period,
      approvedById: data.approvedById,
      notes: data.notes,
      snapshot,
    },
    update: {
      approvedById: data.approvedById,
      notes: data.notes,
      snapshot,
    },
    include: { approvedBy: { select: { id: true, displayName: true, username: true } } },
  });
}

export async function listTrialBalanceApprovals() {
  return prisma.trialBalanceApproval.findMany({
    where: {},
    include: { approvedBy: { select: { id: true, displayName: true, username: true } } },
    orderBy: { period: 'desc' },
  });
}

export async function updateAccount(
  id: number,
  data: Partial<{ name: string; code: string; isActive: boolean }>
) {
  const account = await prisma.account.findFirst({ where: { id } });
  if (!account) throw new AppError(404, 'Account not found');
  return prisma.account.update({ where: { id }, data });
}

/** Soft-delete: hides account from lists; ledger entries are kept until vouchers are cancelled. */
export async function softDeleteAccount(id: number) {
  const account = await prisma.account.findFirst({ where: { id, isActive: true } });
  if (!account) throw new AppError(404, 'Account not found');
  if (isInventoryAccountName(account.name)) {
    throw new AppError(400, 'The Inventory account cannot be deleted');
  }
  return prisma.account.update({
    where: { id },
    data: { isActive: false },
    include: { category: true, ledger: true },
  });
}
