/**
 * One-time import of legacy account balances (from the old cTnSoft "Account
 * Balance [All Groups]" PDF report, as-on 08-Sep-26) into this app's chart
 * of accounts.
 *
 * WHAT THIS DOES
 * - Only imports ACCOUNT NAME + BALANCE (with Dr/Cr side) from the old
 *   report. The old numeric account codes (103002, 202001, ...) are not
 *   imported anywhere — this app generates its own codes.
 * - Reuses existing categories/system accounts wherever this app already
 *   has an equivalent (Sale Party, Int./Ext. Purchase Party, Bank, Cash in
 *   Hand, Bardana Bori/Thela, Sale Fee PaleDari/Broker/Market Fee/etc.,
 *   Revenue, Capital, Rental Expense) instead of creating duplicates.
 * - Creates new categories only where nothing already exists (Account
 *   Receivable, Accounts Payable, Discount Allowed, Employee Related
 *   Expenses, Miscellaneous Expenses, Notes Payable, Phone Expenses, Staff
 *   Member).
 * - "Maal Khata" rows are imported as PRODUCTS (via createProduct), not
 *   bare accounts — each product auto-creates its own Maal Khata ledger,
 *   matching how this app's existing product/opening-balance flow works.
 * - Any balance under Rs. 10 (absolute value) is imported as ZERO — a
 *   deliberate rounding-dust cleanup. Balances that were already exactly
 *   0.00 in the source report are still created, just at 0.
 * - Every new Account/Product goes through the normal
 *   PENDING_APPROVAL -> approve flow so the opening balance posts and
 *   offsets correctly against the hidden "Opening Balance Equity" account
 *   — then is immediately auto-approved (there's no reviewer for a
 *   one-time bulk historical import).
 * - Idempotent: safe to re-run. Anything that already exists by name is
 *   skipped, not duplicated.
 *
 * DECISIONS FLAGGED FOR REVIEW (search "REVIEW:" below for each):
 * 1. Grain Sale Fee system account is named "PaleDari" (renamed from Mazduri) —
 *    live Kachi PaleDari postings already used that ledger; historical PaleDari
 *    opening balance is applied to it. Do not create a separate PaleDari row.
 * 2. "Qari Zia Ullah" kept only under Ext. Purchase Party (A/R duplicate dropped).
 *    "Home Expances" kept only under Miscellaneous Expenses (Capital duplicate dropped).
 * 3. "Maal Khata [Stock]" is skipped entirely — every value in it is 0.00 and there is
 *    no current equivalent concept in this app.
 *
 * HOW TO RUN
 *   cd backend
 *   npx tsx prisma/seed-legacy-import.ts
 *   # or: npm run seed:legacy -w backend
 */

import { AccountType } from '@prisma/client';
import { prisma } from './prisma';
import {
  createAccount,
  createAccountCategory,
  postOpeningBalanceForLedger,
  CASH_IN_HAND_ACCOUNT_NAME,
  ensureSaleCommissionAccounts,
  ensureSalePaunchAccounts,
} from '../modules/accounting/accounting.service';
import { approvePendingRecord } from '../modules/approvals/approvals.service';
import { createProduct } from '../modules/products/products.service';
import { logger } from './logger';

type Side = 'DR' | 'CR';
/** [account name (as printed in the old report), raw balance, Dr/Cr side] */
type Row = [string, number, Side];

// ── Rule: any balance under Rs. 10 (absolute) imports as zero. ──────────
function amt(n: number): number {
  return Math.abs(n) < 10 ? 0 : Math.abs(n);
}

let created = 0;
let skipped = 0;
let failed = 0;

async function getAdminId(): Promise<number> {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No admin user found — run the main seed (prisma/seed.ts) first.');
  return admin.id;
}

async function getActiveFinancialYearId(): Promise<number> {
  const year = await prisma.financialYear.findFirst({ where: { status: 'ACTIVE' } });
  if (!year) throw new Error('No active financial year found — run the main seed first.');
  return year.id;
}

async function ensureCategoryId(name: string, fallbackType: AccountType): Promise<number> {
  const existing = await prisma.accountCategory.findFirst({ where: { name } });
  if (existing) return existing.id;
  const cat = await createAccountCategory(name);
  return cat.id;
}

/** Create a brand-new account (skip if it already exists by name), then auto-approve it. */
async function seedAccount(
  createdById: number,
  categoryId: number,
  name: string,
  type: AccountType,
  balance: number,
  side: Side,
) {
  const trimmed = name.trim();
  try {
    const existing = await prisma.account.findFirst({ where: { name: trimmed } });
    if (existing) {
      console.log(`  skip (exists): ${trimmed}`);
      skipped++;
      return;
    }
    const value = amt(balance);
    const account = await createAccount({
      categoryId,
      name: trimmed,
      type,
      openingBalance: value,
      openingBalanceSide: value > 0 ? side : undefined,
      createdById,
    });
    await approvePendingRecord('account', account.id);
    console.log(`  + ${trimmed} (${value} ${side})`);
    created++;
  } catch (err) {
    console.error(`  FAILED: ${trimmed} —`, (err as Error).message);
    failed++;
  }
}

/** Set an opening balance on an EXISTING system account, only if it doesn't already have one. */
async function setExistingAccountOpeningBalance(accountName: string, balance: number, side: Side) {
  const value = amt(balance);
  if (value === 0) {
    console.log(`  skip (zero): ${accountName}`);
    return;
  }
  try {
    const account = await prisma.account.findFirst({
      where: { name: accountName },
      include: { ledger: true },
    });
    if (!account || !account.ledger) {
      console.warn(`  WARNING: system account "${accountName}" not found — skipping.`);
      failed++;
      return;
    }
    if (Number(account.ledger.balance) !== 0) {
      console.log(`  skip (already has a balance): ${accountName}`);
      skipped++;
      return;
    }
    const financialYearId = await getActiveFinancialYearId();
    await prisma.$transaction(async (tx) => {
      await postOpeningBalanceForLedger(tx, {
        ledgerId: account.ledger!.id,
        accountName: account.name,
        amount: value,
        side,
        financialYearId,
      });
    });
    console.log(`  = ${accountName} (${value} ${side})`);
    created++;
  } catch (err) {
    console.error(`  FAILED: ${accountName} —`, (err as Error).message);
    failed++;
  }
}

/** Create a grain Product (auto-creates its own Maal Khata account), then auto-approve it. */
async function seedProduct(createdById: number, name: string, balance: number, side: Side) {
  const trimmed = name.trim();
  try {
    const existing = await prisma.product.findFirst({ where: { name: trimmed } });
    if (existing) {
      console.log(`  skip (exists): ${trimmed}`);
      skipped++;
      return;
    }
    const value = amt(balance);
    const product = await createProduct({
      name: trimmed,
      openingBalance: value,
      openingBalanceSide: value > 0 ? side : undefined,
      createdById,
    });
    await approvePendingRecord('product', product.id);
    console.log(`  + [product] ${trimmed} (${value} ${side})`);
    created++;
  } catch (err) {
    console.error(`  FAILED (product): ${trimmed} —`, (err as Error).message);
    failed++;
  }
}

async function seedRows(
  createdById: number,
  categoryId: number,
  type: AccountType,
  rows: Row[],
) {
  for (const [name, balance, side] of rows) {
    await seedAccount(createdById, categoryId, name, type, balance, side);
  }
}

export async function runLegacyAccountImport() {
  created = 0;
  skipped = 0;
  failed = 0;
  const createdById = await getAdminId();

  console.log('\n== Ensuring system accounts exist ==');
  await prisma.$transaction(async (tx) => {
    await ensureSaleCommissionAccounts(tx);
    await ensureSalePaunchAccounts(tx);
  });

  // ── 1. Existing system accounts — set opening balance only, don't create ──
  console.log('\n== Existing system accounts ==');
  await setExistingAccountOpeningBalance(CASH_IN_HAND_ACCOUNT_NAME, 822405.47, 'DR'); // "Net Cash"
  await setExistingAccountOpeningBalance('Bori', 250910.39, 'DR'); // "Bardana [Bori]"
  await setExistingAccountOpeningBalance('Thela', 1053976.7, 'DR'); // "Bardana [Thela]"
  await setExistingAccountOpeningBalance('PaleDari', 20933, 'DR'); // was "Mazduri" system account
  await setExistingAccountOpeningBalance('Broker', 10128, 'DR'); // "Brokery" in the old report
  await setExistingAccountOpeningBalance('Market Fee', 27381, 'DR'); // "Markeet Fee" in the old report
  await setExistingAccountOpeningBalance('Munshiana', 2800, 'CR'); // "Munciana" in the old report
  await setExistingAccountOpeningBalance('Dalali', 2554, 'CR');
  await setExistingAccountOpeningBalance('Sutli', 805, 'CR');
  await setExistingAccountOpeningBalance('Misc', 0, 'DR'); // "Misc Exp" — already zero
  await setExistingAccountOpeningBalance('Commission', 25950, 'CR');
  await setExistingAccountOpeningBalance('Paunch Revenue', 1476639, 'DR'); // "Pahunch Revenue"
  await setExistingAccountOpeningBalance('Tax Deduction', 11513, 'DR');

  // ── 2. New Sale Fee accounts with no existing match ──
  console.log('\n== Sale Fee (new sub-accounts) ==');
  {
    const saleFeeId = await ensureCategoryId('Sale Fee', AccountType.EXPENSE);
    await seedRows(createdById, saleFeeId, AccountType.EXPENSE, [
      ['Mill Tax For Return', 2300, 'DR'],
      ['Stock Maal', 0, 'DR'],
    ]);
  }

  // ── 3. Revenue (new sub-accounts; Commission + Paunch Revenue handled above) ──
  console.log('\n== Revenue (new sub-accounts) ==');
  {
    const revenueId = await ensureCategoryId('Revenue', AccountType.REVENUE);
    await seedRows(createdById, revenueId, AccountType.REVENUE, [
      ['Debit Note', 1, 'CR'],
      ['Dammi', 0, 'DR'],
      ['Kiraya', 0, 'DR'],
    ]);
  }

  // ── 4. Rental Expense (new sub-account; Tax Deduction handled above) ──
  console.log('\n== Rental Expense (new sub-account) ==');
  {
    const rentalId = await ensureCategoryId('Rental Expense', AccountType.EXPENSE);
    await seedRows(createdById, rentalId, AccountType.EXPENSE, [['Bilty Kiraya', 0, 'DR']]);
  }

  // ── 5. Bank (new accounts under the existing "Bank" category) ──
  console.log('\n== Bank ==');
  {
    const bankId = await ensureCategoryId('Bank', AccountType.ASSET);
    await seedRows(createdById, bankId, AccountType.ASSET, [
      ['NBP', 6000, 'DR'],
      ['Allied Bank 0836', 8718, 'DR'],
      ['Bank ALFALAH 303', 22293.3, 'DR'],
      ['Bank Al-HABIB', 69988, 'DR'],
      ['JS bank', 14750, 'DR'],
      ['FAISAL BANK 937', 2409, 'DR'],
      ['MEEZAN BANK', 1508905, 'DR'],
      ['UBL 37104264', 236440, 'DR'],
      ['Al-Barka', 10035, 'DR'],
      ['HBL freedom', 40604, 'DR'],
      ['MCB 3938', 29009, 'DR'],
      ['Soneri Bank', 12402, 'DR'],
      ['BOP', 20836, 'DR'],
      ['Allied Bank 0057', 11588, 'DR'],
      ['MBL S.S', 120998, 'DR'],
      ['Bank Islami', 6447, 'DR'],
      ['Bank Al-Habib SS', 8972, 'DR'],
      ['Bank Islami SUFI & CO', 22362, 'DR'],
    ]);
  }

  // ── 6. Brand-new categories ──
  console.log('\n== Account Receivable (new category) ==');
  {
    const id = await ensureCategoryId('Account Receivable', AccountType.ASSET);
    await seedRows(createdById, id, AccountType.ASSET, [
      ['Qari Riaz Ahmad Sahib', 0, 'DR'],
      ['Short cash & Other Losses', 0, 'DR'],
      ['M.Safdar Brokar', 35000, 'DR'],
      ['Dasti Account', 0, 'DR'],
      ['Common Brothers Account', 0, 'DR'],
      ['Allah Dittah Thekedar', 4625, 'DR'],
      ['Raqbah Sale', 0, 'DR'],
      ['Hamzah Noor', 0, 'DR'],
      ['Rajab Ali Billal kot', 0, 'DR'],
      ['Abdullah Autos', 0, 'DR'],
      ['Plot Taqwa Coloni', 0, 'DR'],
      ['Mistari Khleel', 0, 'DR'],
    ]);
  }

  console.log('\n== Accounts Payable (new category) ==');
  {
    const id = await ensureCategoryId('Accounts Payable', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['Mohsin Ashraf Bank Al-Habib', 5000000, 'CR'],
      ['Zauja M.Amin', 0, 'CR'],
      ['MaShaAllah Karyana Store', 0, 'CR'],
      ['Ghulam Mustafa Arian Pul Ghani', 0, 'CR'],
      ['HAfiz Nawaz Billa Kot', 0, 'CR'],
      ['MOHSIN ASHRAF SB.13/G CTN', 1000000, 'DR'],
      ['Zouja Iftkhar Ahmad', 446126, 'CR'],
    ]);
  }

  console.log('\n== Discount Allowed (new category) ==');
  {
    const id = await ensureCategoryId('Discount Allowed', AccountType.EXPENSE);
    await seedRows(createdById, id, AccountType.EXPENSE, [['Credit Note', 0, 'DR']]);
  }

  console.log('\n== Employee Related Expenses (new category) ==');
  {
    const id = await ensureCategoryId('Employee Related Expenses', AccountType.EXPENSE);
    await seedRows(createdById, id, AccountType.EXPENSE, [['Wages Account', 0, 'DR']]);
  }

  console.log('\n== Miscellaneous Expenses (new category) ==');
  {
    const id = await ensureCategoryId('Miscellaneous Expenses', AccountType.EXPENSE);
    await seedRows(createdById, id, AccountType.EXPENSE, [
      ['Shop Expances', 0, 'DR'],
      ['Sadqah', 831290, 'DR'],
      ['Z', 143600, 'DR'],
      ['Home Expances', 0, 'DR'],
      ['New Shop Construction.exp', 0, 'DR'],
      ['Nizam ul Deen Rang Wala', 0, 'DR'],
    ]);
  }

  console.log('\n== Notes Payable (new category) ==');
  {
    const id = await ensureCategoryId('Notes Payable', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [['Suspance Account', 0, 'CR']]);
  }

  console.log('\n== Phone Expenses (new category) ==');
  {
    const id = await ensureCategoryId('Phone Expenses', AccountType.EXPENSE);
    await seedRows(createdById, id, AccountType.EXPENSE, [['Bill Phone Electricty', 0, 'DR']]);
  }

  console.log('\n== Staff Member (new category) ==');
  {
    const id = await ensureCategoryId('Staff Member', AccountType.ASSET);
    await seedRows(createdById, id, AccountType.ASSET, [
      ['Sufi Muhammad SaleemUllah', 0, 'DR'],
      ['SUFI M.AHMAD NADEEM', 0, 'DR'],
      ['Muhammad Rafique', 205079, 'DR'],
      ['Hafiz M Kamran', 0, 'DR'],
      ['M.Shahbaz YONAS', 0, 'DR'],
      ['Muhammad shafiq Acc.', 18000, 'DR'],
    ]);
  }

  // ── 7. Existing party categories — full account lists ──
  console.log('\n== Sale Party (existing category) ==');
  {
    const id = await ensureCategoryId('Sale Party', AccountType.ASSET);
    await seedRows(createdById, id, AccountType.ASSET, [
      ['Al-Qayyum Flour Mills', 0, 'DR'],
      ['AL-Karam Flour Mills', 0, 'DR'],
      ['Taaj Flour Mills', 0, 'DR'],
      ['Al-Meezan Flour Mills', 0, 'DR'],
      ['Bahoo Flour Mills', 0, 'DR'],
      ['Al-Amin Flour Mills', 0, 'DR'],
      ['Meharban Flour Mills', 0, 'DR'],
      ['Bhahmi khan Flour Mills', 0, 'DR'],
      ['Dahqan Flour Mills', 0, 'DR'],
      ['Haji Abdul Aziz & Sons', 0, 'DR'],
      ['Panwar Flour Mills', 0, 'DR'],
      ['Billal Wahid Flour Mills', 35955, 'DR'],
      ['Aslam Javed Flour Mills', 0, 'DR'],
      ['Naveed Usman Flour Mills', 0, 'DR'],
      ['Golden Flour Mills', 0, 'DR'],
      ['Gandhara Flour Mills', 0, 'DR'],
      ['Abdullah Flour Mills', 0, 'DR'],
      ['Al-Mukhtar Flour Mills', 0, 'DR'],
      ['AL-Habib Flour Mills', 165258, 'CR'],
      ['Al-Fazal Flour Mills', 0, 'DR'],
      ['FINE FLOUR MILLS', 0, 'DR'],
      ['Ahmad Flour Mills', 0, 'DR'],
      ['Mukarram Flour Mills', 0, 'DR'],
      ['Chanab Flour Mills', 0, 'DR'],
      ['Durrani Flour Mills', 0, 'DR'],
      ['XYZ', 0, 'DR'],
      ['Safia Flour Mills', 0, 'DR'],
      ['New Punjab Flour Mills', 0, 'DR'],
      ['Arabia Flour Mills', 0, 'DR'],
      ['Afzal Brothers Flour Mills', 0, 'DR'],
      ['Shaihda Flour mills', 0, 'DR'],
      ['National Flour Mills', 0, 'DR'],
      ['Tayebah Cotton Ginners', 0, 'DR'],
      ['Muzzaffar Flour Mills', 0, 'DR'],
      ['Cash Party', 0, 'DR'],
      ['Channab Wah Cantt', 0, 'DR'],
      ['New Lasani Flour Mills', 0, 'DR'],
      ['Rahmat Flour Mills', 0, 'DR'],
      ['Nazim flour Mills', 0, 'DR'],
      ['Lasani Flour Mills Wah', 0, 'DR'],
      ['Hafiz Chakki', 0, 'DR'],
      ['SONA flour mills', 0, 'DR'],
      ['????? (Sale Party)', 0, 'DR'],
      ['United Flour Mills', 0, 'DR'],
      ['Ibrahim Flour Mills', 0, 'DR'],
      ['Burhan Flour Mills', 0, 'DR'],
      ['Janjua flour Mills', 0, 'DR'],
      ['Lasani Flour Mills', 0, 'DR'],
      ['Hanif Flour Mills', 0, 'DR'],
      ['Gujrat Flour Mills', 0, 'DR'],
      ['Shan flour Mills', 0, 'DR'],
      ['Sadiq Abad Flour Mills', 0, 'DR'],
      ['Mehran Flour Mills', 0, 'DR'],
      ['Kohistan Flour mills', 0, 'DR'],
      ['Al-Rahmat Rice Mills', 5060, 'DR'],
      ['CH.Abdul Rehman Bahawalnagar Rice Mills', 0, 'DR'],
      ['Ch.Amir Naveed Al-Raheem Rice Factory', 0, 'DR'],
      ['Shahbaz Flour Mills', 0, 'DR'],
      ['Itfaq Rice millls', 0, 'DR'],
      ['Mian Umer Sharif Rice Mills', 0, 'DR'],
      ['A B Rice Mills', 0, 'DR'],
      ['Ahmad Fazeel Flour Mills', 0, 'DR'],
      ['Waqas Fahad', 0, 'DR'],
      ['Food Department', 0, 'DR'],
      ['AL-NOOR Rice Mills', 0, 'DR'],
      ['AL-Khair Rice Mills', 0, 'DR'],
      ['Three Star Rice Mills', 0, 'DR'],
      ['Al Rahmat Cotton Ginner', 0, 'DR'],
      ['Al-Ameen Raice Mills', 0, 'DR'],
      ['Royal Flour Mills', 0, 'DR'],
      ['Yasrab Flour Mills', 0, 'DR'],
      ['Mian Umar Sharif Flour Mills', 118548, 'DR'],
      ['Saif.Sb.Unilever', 0, 'DR'],
      ['Syed Brothers Flour Mills', 0, 'DR'],
      ['Geelani Flour Mills', 31063, 'DR'],
      ['Rana Abdul Waheed ref al-Qayyum Flour Mills', 0, 'DR'],
      ['Shahid Waqas Flour Mill', 0, 'DR'],
      ['QAZI Brothers Flour Mills', 0, 'DR'],
    ]);
  }

  console.log('\n== Ext. Purchase Party (existing category) ==');
  {
    const id = await ensureCategoryId('Ext. Purchase Party', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['MEEZAN BANK ATC-519', 4048271, 'CR'],
      ['M.Ishtiaq 54/F', 206, 'CR'],
      ['Master Aashiq karyana Store', 0, 'CR'],
      ['M.Ijaz Anjum Thaheem', 35420, 'DR'],
      ['CROWN EV Center Bahawalnagar', 3862000, 'DR'],
      ['Naveed Traders', 0, 'CR'],
      ['Rajab Ali S/O M.Yar Arian', 46312, 'DR'],
      ['Hafiz Ghafoor Ahmad S/o Noor Ahmad', 2025000, 'DR'],
      ['M.Amir S/O Gh.Rasool', 0, 'CR'],
      ['Al-Haram Oil Mills', 336159, 'DR'],
      ['Sufi Oil Mills', 0, 'CR'],
      ['Muneer Ahmad Munnee', 0, 'CR'],
      ['Ahmad Yar (Hamaun)Via Munshi Irshad', 0, 'CR'],
      ['Arif Hussain Bajwah', 290, 'CR'],
      ['Saif Ur Rehman & Company', 0, 'CR'],
      ['Mian Manzoor Ahmad S/O Ghulam Nabi', 15000000, 'CR'],
      ['Muhammad Nawaz S/O M.Shareef', 0, 'CR'],
      ['Arain goods Hasilpur', 3000, 'CR'],
      ['Muneer Ahmad Rahmani Jamal Pur', 113500, 'DR'],
      ['M.Imtiaz Khan Lakhwera', 224914, 'DR'],
      ['Mutee UR Rahman S/O Haji Shar Muhammad', 0, 'CR'],
      ['M.Khalid Jutt Sadiq Ngar', 0, 'CR'],
      ['Imran Afzal (Al- Meezan Flour Mills)', 0, 'CR'],
      ['M.Ahmad Kamboh 30/gajyani', 0, 'CR'],
      ['haji.M Riaz joiya', 0, 'CR'],
      ['Khaad', 0, 'CR'],
      ['Shabbeer Gullah', 0, 'CR'],
      ['Ghulam Mustafa khad farosh', 447300, 'CR'],
      ['Mumtaz Ahmad Arain S/o M.Fiaz Saleem Kot', 529, 'CR'],
      ['M.Aslam S/O M.Bux Araein', 0, 'CR'],
      ['M.Azam S/O Nazam Chak Abdullah', 0, 'CR'],
      ['Sheikh Ali Shatabah', 0, 'CR'],
      ['M.Riaz S/o M.shareef', 0, 'CR'],
      ['Mumtaz Shareef', 0, 'CR'],
      ['M.Ameen S/o Nazeer Shah Abas', 0, 'CR'],
      ['Aqsa Cloth Hous', 0, 'CR'],
      ['Mian M.Akram Matyana SB', 56486, 'CR'],
      ['Master M Mazhar Basti Akram Wali', 0, 'CR'],
      ['M.Akbar S/O Basheer Jut', 8340, 'DR'],
      ['M.Shahbaz S/O M.younas', 0, 'CR'],
      ['Rana Farooq Traders Madressa', 0, 'CR'],
      ['Hafiz M.Yaseen Bhae', 2731228, 'CR'],
      ['Manga Khokhar', 0, 'CR'],
      ['Abd Ul Latif Shah Abbas', 5000, 'DR'],
      ['Sufi M.Saleem Ullah', 24367146, 'DR'],
      ['M.Hanif Khan Pathan', 0, 'CR'],
      ['Qari M.Ahmad Baloch', 36419, 'DR'],
      ['Hafiz Basheer Ahmad', 0, 'CR'],
      ['Toyata.C-HR M.Abid bhai', 0, 'CR'],
      ['Qari M.Saleem Sb', 0, 'CR'],
      ['M.shareef Arain Shah Abbas', 0, 'CR'],
      ['Common Default Accounts', 70270, 'CR'],
      ['Mehboob Ali Bhanja', 0, 'CR'],
      ['Sufi M.Iqbal Bhae', 918779, 'CR'],
      ['M.Ayaz Basti Noshahra', 0, 'CR'],
      ['Stock Wheat At Abdul Jabbar Home', 0, 'CR'],
      ['M.ishfaq S/O M Shafee 116/m', 0, 'CR'],
      ['Waheed Arshid Chak Dhudian', 0, 'CR'],
      ['Mehboob Alam Wirk', 0, 'CR'],
      ['Sana Ullah S/O Hafiz Mumtaz', 0, 'CR'],
      ['Hashmat Alee Hanjra', 0, 'CR'],
      ['hafiz Riaz Baloch', 0, 'CR'],
      ['Shafaat Ali', 0, 'CR'],
      ['fateh muhammad 9 g', 0, 'CR'],
      ['Shahzad Araien S/o G.Farid', 2025, 'CR'],
      ['Mix Parties', 0, 'CR'],
      ['Haji Karam Khan Bhadera', 0, 'CR'],
      ['Wahab Brokar', 0, 'CR'],
      ['Abid Brokar', 0, 'CR'],
      ['M.Abbas Shah Abbas', 0, 'CR'],
      ['Sultan Ghee', 0, 'CR'],
      ['Fouji M.Asghar', 300, 'CR'],
      ['Noor Ahmad Kamboh Jand Wala', 0, 'CR'],
      ['M.siddique Arain Shah Abbas', 0, 'CR'],
      ['M.Iqbal S / O Muhammad Yar Bhaderah', 0, 'CR'],
      ['Syed Ijaz Shah', 0, 'CR'],
      ['White Gold Cotton IND.', 1, 'CR'],
      ['Rao mehmood chak chopa', 0, 'CR'],
      ['Khalid Majeed 9/FW', 0, 'CR'],
      ['M.Deen Chak Chopah', 0, 'CR'],
      ['Liaqat Ali Saleem Kot', 0, 'CR'],
      ['Ch Habib Corporation Maroot', 0, 'CR'],
      ['Baraham Khan Bhadera', 0, 'CR'],
      ['M.Iqbal Arain Noshahra', 0, 'CR'],
      ['Hafiz M.Kamran Zamindara Colony', 451275, 'CR'],
      ['Bhae M.ILYAS JAJJA SB.', 285161, 'DR'],
      ['Fouji Khal farosh', 0, 'CR'],
      ['M.Tariq 34/ f', 0, 'CR'],
      ['M.Usman Main S/o M.Bux', 0, 'CR'],
      ['Allah Yar Mahar Sharif', 0, 'CR'],
      ['Wali Shair bhadera', 0, 'CR'],
      ['Expences Of Al-Haram Oil Mills', 323204, 'DR'],
      ['Nasr Ullah R Head Master', 85000, 'DR'],
      ['Abdul Majid 11/fw', 0, 'CR'],
      ['M.Mazhar S/o Sajwara co zahoor', 0, 'CR'],
      ['Saleem Kohri Driver', 0, 'CR'],
      ['Iftkhar ahmad Chak Abdullah', 0, 'CR'],
      ['Umer farooq S/O Ahmad Bux', 0, 'CR'],
      ['Hafiz Manzoor Ahmad Mahar Sharif', 0, 'CR'],
      ['Munshi Irshad S/O Ghafoor Ahmad', 0, 'CR'],
      ['Punoo khan Baloch', 0, 'CR'],
      ['M.Yaseen Jut', 0, 'CR'],
      ['M.Imtiaz S/O Ahmad Yar Topi', 0, 'CR'],
      ['Bismillah Agri Center', 0, 'CR'],
      ['Qari Farhan s/o Master Idrees', 150065, 'CR'],
      ['Muddssar Habib', 0, 'CR'],
      ['Ghulam Mustafa Old CTN', 0, 'CR'],
      ['Nusrat Anwar', 0, 'CR'],
      ['Faisal Abad Karachi Goods', 0, 'CR'],
      ['M.Asad Aslam Mahar sharif', 900, 'CR'],
      ['M.Yousuf Araein', 0, 'CR'],
      ['M.Abid Setlite Town', 874, 'DR'],
      ['Habib ul lah Hangra', 0, 'CR'],
      ['AL-Rahmat Corporation', 0, 'CR'],
      ['Rokdee Khatah', 43, 'DR'],
      ['Unfix Wheat', 0, 'CR'],
      ['M.Younus Arain Thekedar', 0, 'CR'],
      ['M.Afzal S/O Fatih Muhammad 3/g', 0, 'CR'],
      ['M.Irshad S/O Ghafoor chak chopa', 0, 'CR'],
      ['Abd Ul Sattar Dhudhe', 53, 'CR'],
      ['Fida Husain Chak Chopa', 0, 'CR'],
      ['M.Azeem S/O M Akhtar', 735, 'CR'],
      ['M. Arif Sanpal', 0, 'CR'],
      ['M.Kaleem Ravi 3/ fw', 0, 'CR'],
      ['Noor Ahmad S/O Faqeer Muhammad 2/g', 51015, 'DR'],
      ['M.Shafee S/O Ihsan', 0, 'CR'],
      ['M.Irfan S/O Ghulam Rasool', 0, 'CR'],
      ['Zauja M. Yunus Home Mulazimah', 0, 'CR'],
      ['M.Shahid Basti Noshahrah', 0, 'CR'],
      ['Mukhtiar Ahmad S/O Ahmad Bux', 0, 'CR'],
      ['M.Qamar Palamber', 0, 'CR'],
      ['Bholla Hotal Wala', 5000, 'DR'],
      ['M.Riaz Jar Palledar', 8, 'DR'],
      ['M.Yaseen S/ O Allah Dittah Hamaon', 1, 'CR'],
      ['Sheikh Ejaz Santary', 0, 'CR'],
      ['Usman Aluminium', 0, 'CR'],
      ['Mahinder Kumar', 0, 'CR'],
      ['Imtiaz Toti Chak Abdullah', 0, 'CR'],
      ['M.Sarwar Talha Jewellers', 0, 'CR'],
      ['Malik Shahid Haroon Abad', 0, 'CR'],
      ['M.Tariq S/O Niaz Ahmad (Gheddo)', 0, 'CR'],
      ['Sufi Abdul Jabbar', 0, 'CR'],
      ['Basheer Ahmad S/O Haji M Yaar', 1000, 'DR'],
      ['Arshid Kamboh Kiryana Satoor', 0, 'CR'],
      ['Khuram Shahzad Gill 111 Murad', 0, 'CR'],
      ['Ch Shahzad 13 G', 0, 'CR'],
      ['Aziz Urrahman Kamboh 30/G', 6, 'CR'],
      ['Rana Amjid Shahzad (United Traders)', 0, 'CR'],
      ['Allah Dittah (A D )', 10000, 'DR'],
      ['Ghazi Chakki Wala', 0, 'CR'],
      ['Shoukat Ali Hanjra', 0, 'CR'],
      ['M.Tufail Sukhera Chak Abdullah', 759, 'DR'],
      ['Expances Of Raqbah 7/FW', 0, 'CR'],
      ['Abd Ul Shakur Basti Akram Wali', 0, 'CR'],
      ['Ch.Jan Muhammad & Sons', 0, 'CR'],
      ['M.Yousuf Tali Wala Khoh', 9, 'CR'],
      ['M.Akram S/O Haji Khursheed Ahmad', 0, 'CR'],
      ['Zahid Hassan S/O Masoora Basti Noonan', 0, 'CR'],
      ['Qari Ghulam Murtaza SB', 140000, 'DR'],
      ['Master M Hafeez Thaheem', 0, 'CR'],
      ['Muhammad Muneer BWN', 0, 'CR'],
      ['Umer Usman Commission Agents', 0, 'CR'],
      ['M Iqbal Traders Fort Abbas', 0, 'CR'],
      ['M.Ramzan Rajad 4/g', 0, 'CR'],
      ['M.Sadiq & Co Yazman', 0, 'CR'],
      ['M.Zafar S/O M Shareef Ihata Pathan Wala', 163, 'CR'],
      ['Mazhar Ali Electronics Madressa', 0, 'CR'],
      ['Plot Mian Arshid Matyana', 0, 'CR'],
      ['Golden Commission Shop', 0, 'CR'],
      ['Malik Talat Madrissah', 0, 'CR'],
      ['Ghulam Mustafa S/O Bagh Ali', 0, 'CR'],
      ['M.Faryad Kothee 47000', 0, 'CR'],
      ['Fazal Hassan Lakhweera', 0, 'CR'],
      ['M.Ameer S/O Khuda Bukhsh', 0, 'CR'],
      ['Shuaib Ahmad Jand Wala', 0, 'CR'],
      ['M.Sarwar S/O M.shafee 13 / G', 104, 'CR'],
      ['Malik Ahmad Raza & Malik Anees Seed Frosh', 0, 'CR'],
      ['M.Abbas Arain Basti Azeem', 0, 'CR'],
      ['M.Mushtaq S/O Ahmad Ali', 119, 'CR'],
      ['Naeem Pesticide 47 / F', 0, 'CR'],
      ['Stock Paddy Via M A Karyana', 0, 'CR'],
      ['Haji Manzoor Ahmad Basti Ghara', 0, 'CR'],
      ['M.Yousuf S / O Nazeer Ahmad', 0, 'CR'],
      ['Hafiz Umer Farooq', 0, 'CR'],
      ['Hafiz M Farooq 4 /1r', 0, 'CR'],
      ['M.Tariq 28/ g', 0, 'CR'],
      ['M.Shahzad 47/ F', 614, 'CR'],
      ['Qayyum Kharal', 4200, 'DR'],
      ['Muneer Ahmad S / O M. Yar', 0, 'CR'],
      ['Tanweer Tariq S / O M.Jameel 2 /G', 0, 'CR'],
      ['Saeed Ahmad LET 2227', 0, 'CR'],
      ['Khaleeq Ur Rehman S / O M.Amin', 0, 'CR'],
      ['M.Ahmad Nadeem', 411145, 'DR'],
      ['Hafiz Nawaz Bilal Kot', 0, 'CR'],
      ['Qari M Moosa SB', 0, 'CR'],
      ['Mian M.Ramzan 107/F', 0, 'CR'],
      ['M. Iqbal S/O Muhammad yar Bhadeerah', 10000, 'DR'],
      ['Muhammad Shafique 9 / G', 21829, 'CR'],
      ['Master Muhammad Ashraf S/O Yaqub', 0, 'CR'],
      ['Babar Husain Basti Ashiq Muhammad', 0, 'CR'],
      ['Fakhar Jahan 24 / G', 0, 'CR'],
      ['Akbar Ali 212 /F', 0, 'CR'],
      ['M.Naeem 24 / G', 0, 'CR'],
      ['Ijaz Brothers Maroot', 0, 'CR'],
      ['M.Amir S /O Zafar Bhadera', 0, 'CR'],
      ['Abdurrauf S / O Muhammad Nawaz Shah Abbas', 0, 'CR'],
      ['M.Imran S / O Taj Muhammad Rahmani', 0, 'CR'],
      ['Murawat Khan', 0, 'CR'],
      ['Three Stars', 0, 'CR'],
      ['Ishfaq Khokhar 49 / F', 0, 'CR'],
      ['Muhammad Sajid Siddique', 0, 'CR'],
      ['Ali Akbar S / O M Deen Via Hafia Manzoor', 0, 'CR'],
      ['Allah Rakha Basti Bhoora', 663, 'CR'],
      ['Ghulam Fareed Araeen Shah Abbas', 0, 'CR'],
      ['Mistari Muhammad Husain ( Sooni )', 0, 'CR'],
      ['M.Rafique Chak Abdullah', 0, 'CR'],
      ['Qari Zia Ullah', 180, 'DR'],
      ['Plot Ittefaq City', 15099, 'DR'],
      ['M.Siddique.S/O M.Akram.Bhinda', 0, 'CR'],
      ['Idrees Dogar', 0, 'CR'],
      ['Abd ul Razzaq 54/F', 0, 'CR'],
      ['Munshi abd ul Lateef', 0, 'CR'],
      ['Suddam S/O M Shareef Noshahra', 25, 'CR'],
      ['Ch. Umer Farooq Sadiq Nagar', 0, 'CR'],
      ['Tahir Rahmani Shah Abbas', 0, 'CR'],
      ['Haji Ghulam Rasool Bakhshan Khan', 0, 'CR'],
      ['M.Akhtar S / O Ata muhammad', 0, 'CR'],
      ['Inaam Ullah Setelite Town', 0, 'CR'],
      ['Muzzammil Ali S / O Hakam Ali', 500000, 'CR'],
      ['Sufi Abdul Khaliq (Chona Wala)', 0, 'CR'],
      ['Izhar Concrete PVT LTD', 0, 'CR'],
      ['Amanat Khata', 0, 'CR'],
      ['Fouji M Irfan', 2, 'CR'],
      ['M.A Karyana Store', 0, 'CR'],
      ['Umair Rikshaw Wala', 0, 'CR'],
      ['Abdul Ghafoor Basti Noshahra', 600849, 'CR'],
      ['M.Aslam electrician', 0, 'CR'],
      ['Rehan shah (Shah super store)', 0, 'CR'],
      ['AL-SADIQ COTTON', 0, 'CR'],
      ['Misc. expanses 7 F/w', 0, 'CR'],
      ['M.Abbass Bhaba', 0, 'CR'],
      ['M. Fakhar Hashmi Mahta Jhedo', 0, 'CR'],
      ['M.Irshaad adv. S/O M.Ashraf', 0, 'CR'],
      ['Mistri Faryad Chak Abdullah', 0, 'CR'],
      ['M.Awais S/O M.Abbas 1F/W', 0, 'CR'],
      ['IKRAM TRADERS Jandwala', 0, 'CR'],
      ['Mistri Jaffar', 0, 'CR'],
      ['Plot Gulshan Batool', 0, 'CR'],
      ['Khan Japan Motors', 0, 'CR'],
      ['Hafiz Majeed 9/G', 0, 'CR'],
      ['M.Atiq Ur Rehman', 0, 'CR'],
      ['Mistri.Ijaz', 0, 'CR'],
      ['Qari Nasir sb. Satellite Town', 0, 'CR'],
      ['Shabbir Hussain Basti Noshehra', 0, 'CR'],
      ['Ghulam.Rasool.Rehmani noshera', 0, 'CR'],
      ['Mian M.Rafique Advocate', 0, 'CR'],
      ['Fakhar.Hashmi Mehta Jheadu', 0, 'CR'],
      ['M.Mudasar Iqbal So Khadam Hussain', 0, 'CR'],
      ['M.Awais S/O Jan Muhammad', 0, 'CR'],
      ['M.Talib.So.Yousif chak chopa', 0, 'CR'],
      ['M.Fayyaz S/O Khuda bakhsh', 0, 'CR'],
      ['Meezan Bank AUM-639', 4059780, 'CR'],
      ['M.Arif S/O Ghulam Muhammad', 0, 'CR'],
      ['Saqib.Mushtaq.SO/Mushtaq ahmad', 0, 'CR'],
      ['Ghulam Mustafa SO/Noor Ahmad', 0, 'CR'],
      ['Waheed Murad SO/M.Abbas Ali', 0, 'CR'],
      ['Rana Abdul Waheed Rahim Yar Khan', 0, 'CR'],
      ['M.Deen Cheezal Abbad', 0, 'CR'],
      ['muhammad yaar SO/M Zaman', 0, 'CR'],
      ['Mian M Safdar Matayna Sb', 0, 'CR'],
      ['M.Asif SO/AslamSingapore', 0, 'CR'],
      ['M Fiaz Electrician', 0, 'CR'],
      ['Kiraya Plot & Hall Gulshan Batool', 0, 'CR'],
      ['Mistri Ali Muhammad', 0, 'CR'],
      ['New Hall Construction G-Batool', 446771, 'DR'],
      ['M.Asif bhanja Bakhshan khan', 670, 'DR'],
      ['M.Ameen Tali wala', 0, 'CR'],
      ['Shakir Abbas Pakistan Petr.', 0, 'CR'],
      ['Hadi EV Cente Investment', 3500000, 'DR'],
      ['Abdul Majeed Maharshareef', 0, 'CR'],
      ['Syead Javeed Iqbal SHAH', 0, 'CR'],
      ['Haji Saeed SB', 180, 'CR'],
      ['M.UmerFarooq Bhanja SO/Nawaz', 400000, 'CR'],
      ['Jani Corporation', 0, 'CR'],
    ]);
  }

  console.log('\n== Int. Purchase Party (existing category) ==');
  {
    const id = await ensureCategoryId('Int. Purchase Party', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['Osama Agri produce', 7959873, 'CR'],
      ['M.Hanif & Sons', 430301, 'CR'],
      ['M.Arshid Rafique & Sons', 0, 'CR'],
      ['M.Basheer & Company', 486613, 'CR'],
      ['Al-Ghani Corporation', 593700, 'CR'],
      ['Al-Badar Corporation', 0, 'CR'],
      ['Rana Asad Afzal & Co', 0, 'CR'],
      ['Ithaad Corporation', 0, 'CR'],
      ['Bismillah Trading Company', 0, 'CR'],
      ['Aslam Bardana Farosh', 0, 'CR'],
      ['Bajwah Commission Shop', 0, 'CR'],
      ['Target Commission Shop', 0, 'CR'],
      ['Khalid Corporation', 0, 'CR'],
      ['Hassan Traders', 605279, 'CR'],
      ['Haji Allah Jawaya M.Sadiq', 0, 'CR'],
      ['Haji Shair M.Khurshaid Alam', 1858626, 'CR'],
      ['Hassan Tahir & Co', 1137023, 'CR'],
      ['Rahmat Ali M.Javed', 61582, 'CR'],
      ['Riaz Ahmad & Sons', 0, 'CR'],
      ['Randhawa Traders', 315239, 'CR'],
      ['Talha & Company', 0, 'CR'],
      ['Aqeel & Co', 0, 'CR'],
      ['Umer Farooq & Brothers', 460838, 'CR'],
      ['Gill & Company', 0, 'CR'],
      ['Muhammad Saleem & Brothers', 0, 'CR'],
      ['Hafiz M.Shafique & Co', 0, 'CR'],
      ['Master Corporation', 116840, 'CR'],
      ['Bismillah Traders', 0, 'CR'],
      ['Shafique Sajid & Co', 0, 'CR'],
      ['Hasnat Corporation', 0, 'CR'],
      ['Haji Asmat Ullah & Sons', 49085, 'CR'],
      ['Haji M.Ayyub & Sons', 0, 'CR'],
      ['Arsh Agri produce', 0, 'CR'],
      ['AL-Rahmat traders', 0, 'CR'],
      ['Akram Shareef Corporation', 16257, 'CR'],
      ['Hassan Mujahid & Co', 0, 'CR'],
      ['Peer Zada Atiq & Co', 0, 'CR'],
      ['Maqbool Hussain & Brothers', 0, 'CR'],
      ['Fawad Cotton Ginners', 1, 'DR'],
      ['Faisal Traders', 0, 'CR'],
      ['Jamshaid & Co', 0, 'CR'],
      ['Fareedi Corporation', 183261, 'CR'],
      ['Chattha & Sons', 0, 'CR'],
      ['M.Ashraf M Anwar &Compani', 0, 'CR'],
      ['Al-Habib Corporation', 80594, 'CR'],
      ['Sabir & Brothers', 0, 'CR'],
      ['Khalid & Co', 0, 'CR'],
      ['Mian Mureed Ahmad & Sons', 0, 'CR'],
      ['Hafiz Kashif &Co', 1, 'CR'],
      ['Faqeer Muhammad & Sons', 0, 'CR'],
      ['Rehman Agri Produce commision agents', 0, 'CR'],
      ['CH.M.Saleem & Company', 0, 'CR'],
      ['Nouman Shafi & Co', 0, 'CR'],
      ['Waris Ali & Brothers', 0, 'CR'],
      ['Tawakal Commission Shop', 9, 'DR'],
      ['Muddssar Corporation', 0, 'CR'],
      ['Mehmood Corporation', 1217, 'CR'],
      ['Aslam Corporation', 0, 'CR'],
      ['Khuram Shahzad Corporation', 0, 'CR'],
      ['Shahbaz Corporation', 0, 'CR'],
      ['Zubair Traders', 0, 'CR'],
      ['Haji Ghulam Rasool & Sons', 0, 'CR'],
      ['Chishtian agri produce', 0, 'CR'],
      ['Ali Raza & Company', 1, 'CR'],
      ['Sheikh Ahmad Din & Sons', 0, 'CR'],
      ['Ahmad Corporation', 2489, 'CR'],
      ['Khawaja Commossion Shop', 0, 'CR'],
      ['Tiyyub Traders', 0, 'CR'],
      ['United Traders', 0, 'CR'],
      ['Barkat Ali Corporation', 0, 'CR'],
      ['Lakhwera Traders', 0, 'CR'],
      ['Sahibzada & Company', 148574, 'CR'],
      ['NajumulDin & Company', 0, 'CR'],
      ['Haji M.Yousuf & Sons', 0, 'CR'],
      ['Yousuf Rizwan Corporation', 0, 'CR'],
      ['Chishtian Agro Services', 386105, 'CR'],
      ['Al-Madina Commission Shop', 0, 'CR'],
      ['Usman Faisal & Co', 0, 'CR'],
      ['Hassan Javed & Company', 0, 'CR'],
      ['Peer Shaheed Ky & Company', 0, 'CR'],
      ['Ali Umair Traders', 1, 'CR'],
      ['Haiji Talib Hussain & Sons', 0, 'CR'],
      ['Haji Talib Hussain & Sons', 0, 'CR'],
      ['Fazal Ahmad & Co', 0, 'CR'],
      ['Haji Riasat Ali & Sons', 0, 'CR'],
      ['Syed Corporation', 0, 'CR'],
      ['Ch.Rahmat Ali ShahMuhammad', 139751, 'CR'],
      ['Panjab Trading Carporation', 1, 'DR'],
      ['Haseeb & Brothers', 0, 'CR'],
      ['Sheikh Muddassar Ishaaq & Co', 195148, 'CR'],
      ['Ali Traders', 4, 'CR'],
      ['Malik Qayyum Seed Farosh', 0, 'CR'],
      ['MATLOB Akram & Co', 0, 'CR'],
      ['Asif Corporation', 142299, 'DR'],
      ['Malik Anait Ullah', 2353, 'DR'],
      ['Jatalah Carporation', 0, 'CR'],
      ['Ameer Hamza Khan & Co', 0, 'CR'],
      ['Nayab Traders', 0, 'CR'],
      ['Gakhar Corporation', 0, 'CR'],
      ['Khan Zari Service', 0, 'CR'],
      ['Makki agri produce', 0, 'CR'],
      ['SUFI & CO', 83847, 'DR'],
      ['Sheikh Ihsaan Ullah And company', 0, 'CR'],
      ['Odia Corporation', 0, 'CR'],
      ['IJAZ & CO', 0, 'CR'],
      ['Malik Abdul Wahab & Co', 0, 'CR'],
      ['M.Billal Commission Shop', 0, 'CR'],
      ['Shadab Agri Forms', 54903, 'CR'],
      ['Chaudhry Maqsood Ahmad & CO', 0, 'CR'],
      ['ALIF DIN & SONS', 0, 'CR'],
      ['Usman Akram', 0, 'CR'],
      ['M.Shafi & Company', 0, 'CR'],
      ['Ammar Trader', 0, 'CR'],
      ['Al-Muneer Corporation', 103378, 'CR'],
      ['Sheikh Riaz Ahmad & Co', 0, 'CR'],
      ['M.Azam Corporation', 0, 'CR'],
      ['Shahzad Bardana Farosh', 0, 'CR'],
      ['Adeel Hassan Trading Company', 0, 'CR'],
      ['Iatmaad Corporation', 0, 'CR'],
      ['Pakistan comission shop', 0, 'CR'],
      ['Tiyyub & Co', 0, 'CR'],
      ['Shan Traders', 0, 'CR'],
      ['Mustafa Coton Ginners', 203, 'DR'],
      ['Younus Zahid & Co', 0, 'CR'],
      ['Elahi Carporation', 0, 'CR'],
      ['Usman Trader', 288011, 'CR'],
      ['At Har Corporation', 0, 'CR'],
      ['maintainance Account', 46949, 'DR'],
      ['M.Muneer & Co', 0, 'CR'],
      ['Itfaq & Co', 0, 'CR'],
      ['Geelani Brothers', 2, 'DR'],
      ['Haji Khadim Hussain & sons', 0, 'CR'],
      ['Areeb Arsal & Co', 0, 'CR'],
      ['Shop Grain Market', 0, 'CR'],
      ['Abdullah agri produce', 0, 'CR'],
      ['Arslan Traders', 61499, 'CR'],
      ['Mujeeb Ur Rahman &Co', 0, 'CR'],
      ['Shihab Carporation', 0, 'CR'],
      ['Nazeer Baig & Sons', 0, 'CR'],
      ['Tariq Traders', 0, 'CR'],
      ['Ch M. Khaleel & Sons', 0, 'CR'],
      ['Umer Brothers Bardana merchant', 0, 'CR'],
      ['Ch M Tufail & Co', 0, 'CR'],
      ['M.Rafiq & Compani', 0, 'CR'],
      ['Ch Rauf Ahmad & Co', 0, 'CR'],
      ['Ali Ghaus', 0, 'CR'],
      ['Abd ul lah & Brothers', 0, 'CR'],
      ['M.Akmal Msaleem', 0, 'CR'],
      ['Siddique Jamal Interprizes', 0, 'CR'],
      ['Farooq & Company', 0, 'CR'],
      ['Lala Commission Shop', 0, 'CR'],
      ['Al-Barkat Traders', 13200, 'CR'],
      ['Sheraz Traders', 0, 'CR'],
      ['Ahmad Saeed & Sons', 0, 'CR'],
      ['Sheikh Rahmat Traders', 0, 'CR'],
      ['Ammar Carporation', 0, 'CR'],
      ['M.Ashraf Carporation', 0, 'CR'],
      ['Aleem & Co', 718538, 'CR'],
      ['Fougi Bardana Faroosh', 0, 'CR'],
      ['Anamtah Traders', 0, 'CR'],
      ['Hadi & Bilal Traders', 0, 'CR'],
      ['Saqib Traders', 663816, 'CR'],
      ['Haji M.Khan Bajwah & Sons', 0, 'CR'],
      ['Al-Faisal Carporation', 0, 'CR'],
      ['Sufyan Traders', 0, 'CR'],
      ['Rashid Kashif & Co', 0, 'CR'],
      ['Shahid & Co', 0, 'CR'],
      ['Ch.Khurum Traders', 0, 'CR'],
      ['Ch Fayaz Ahmad Agri produce', 0, 'CR'],
      ['Faiz Rasool & Sons', 0, 'CR'],
      ['Haji Abdul Ghaffar Seed Farosh', 0, 'CR'],
      ['Imran Traders', 0, 'CR'],
      ['M.Amir Agri Produce', 0, 'CR'],
      ['Fiaz Ahmad Ageri Produce', 1, 'CR'],
      ['Asif Khichi Commission Agents', 0, 'CR'],
      ['Ch.M Akram Corporation', 0, 'CR'],
      ['Abu Bakar Bhatti', 0, 'CR'],
      ['Asif & Co Agri Produce', 0, 'CR'],
      ['Malik Muhammad Shafee Abdul Ghaffar', 303, 'DR'],
      ['Ubaid Agri Produce', 0, 'CR'],
      ['Umair Broker', 0, 'CR'],
      ['Haji Muhammad Ameen & Sons', 348, 'DR'],
      ['Waqqas Ghafoor Agri Produce', 0, 'CR'],
      ['Ch. Habib ullah & Sons', 0, 'CR'],
      ['Musa Agri Produce', 545199, 'CR'],
      ['Panjab Agri Produce', 0, 'CR'],
      ['Junaid Corporation', 0, 'CR'],
      ['Muslim Agri Produce', 0, 'CR'],
      ['Riaz agri producers', 0, 'CR'],
      ['Syed Hassan Shah Agri Produce', 1, 'CR'],
      ['Rizwan Nazar agri Produce', 0, 'CR'],
      ['M.Umer Agri Produce', 0, 'CR'],
      ['Nouman Khalid Agri produce', 0, 'CR'],
      ['Awami.Corporation', 25, 'CR'],
      ['Zia.Traders', 0, 'CR'],
      ['Sindhu.Agri produce', 1, 'CR'],
      ['Sheikh M.Ashraf & Sons', 0, 'CR'],
      ['Farooq Khral Trader', 0, 'CR'],
      ['Abdullah MusaAgriproduce', 0, 'CR'],
      ['CH MazharAli andcompany', 0, 'CR'],
      ['Irshaad Traders', 0, 'CR'],
      ['Irfan Traders', 0, 'CR'],
      ['Khan & Co', 0, 'CR'],
      ['Haji.Abdul Aziz sons', 0, 'CR'],
      ['Asad Trader', 0, 'CR'],
      ['Green Star Zaree', 0, 'CR'],
    ]);
  }

  // ── 8. Grain products (Maal Khata) — created as Products, not bare accounts ──
  console.log('\n== Maal Khata (imported as Products) ==');
  await seedProduct(createdById, 'Wheat', 4471462.15, 'DR');
  await seedProduct(createdById, 'Paddy', 0, 'DR');
  await seedProduct(createdById, 'Cotton', 0, 'DR');
  await seedProduct(createdById, 'Sarson', 0, 'DR');
  await seedProduct(createdById, 'Makae', 2284988, 'DR');
  await seedProduct(createdById, 'Mix Items', 0, 'DR');
  await seedProduct(createdById, 'Godam Dhudhiya', 0, 'DR');
  await seedProduct(createdById, 'Irri 9', 0, 'DR');
  await seedProduct(createdById, 'Till', 257, 'CR');
  await seedProduct(createdById, 'Khal', 0, 'DR');
  await seedProduct(createdById, 'Gawara', 0, 'DR');
  await seedProduct(createdById, 'Jantar', 0, 'DR');
  await seedProduct(createdById, 'Mix (Other)', 0, 'DR'); // old report's separate lowercase "mix" row
  await seedProduct(createdById, 'Wheat in Godam', 1146485, 'DR');

  // "Maal Khata [Stock]" is intentionally skipped — see decision #3 above;
  // every value in that section of the old report is 0.00 and this app has
  // no current equivalent concept.

  const summary = { created, skipped, failed };
  console.log(`\nDone. Created/updated: ${created}, skipped (already existed): ${skipped}, failed: ${failed}.`);
  if (failed > 0) {
    console.warn('Some rows failed — check the log above before treating this import as complete.');
  }
  logger.info('Legacy account import finished', summary);
  return summary;
}

/** True when chart looks empty of legacy party/product markers (safe for first packaged run). */
export async function shouldRunLegacyAccountImport(): Promise<boolean> {
  const markers = await prisma.account.count({
    where: {
      OR: [
        { name: 'MEEZAN BANK' },
        { name: 'Osama Agri produce' },
        { name: 'Al-Qayyum Flour Mills' },
      ],
    },
  });
  if (markers > 0) return false;
  const wheat = await prisma.product.findFirst({ where: { name: 'Wheat', isActive: true } });
  return wheat == null;
}
