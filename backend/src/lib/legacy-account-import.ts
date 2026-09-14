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
 * - Creates new categories only where nothing already exists and there is a
 *   non-zero opening balance to import (Account Receivable, Accounts Payable,
 *   Miscellaneous Expenses, Staff Member, etc.). Zero-balance-only categories
 *   from the old report (e.g. Discount Allowed, Notes Payable) are omitted.
 * - "Maal Khata" rows are imported as PRODUCTS (via createProduct), not
 *   bare accounts — each product auto-creates its own Maal Khata ledger,
 *   matching how this app's existing product/opening-balance flow works.
 * - Any balance under Rs. 10 (absolute value) is imported as ZERO — a
 *   deliberate rounding-dust cleanup. Accounts that were exactly 0.00 in
 *   the source report are omitted from this import (not created).
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
  await setExistingAccountOpeningBalance('Commission', 25950, 'CR');
  await setExistingAccountOpeningBalance('Paunch Revenue', 1476639, 'DR'); // "Pahunch Revenue"
  await setExistingAccountOpeningBalance('Tax Deduction', 11513, 'DR');

  // ── 2. New Sale Fee accounts with no existing match ──
  console.log('\n== Sale Fee (new sub-accounts) ==');
  {
    const saleFeeId = await ensureCategoryId('Sale Fee', AccountType.EXPENSE);
    await seedRows(createdById, saleFeeId, AccountType.EXPENSE, [
      ['Mill Tax For Return', 2300, 'DR'],
    ]);
  }

  // ── 3. Revenue (new sub-accounts; Commission + Paunch Revenue handled above) ──
  console.log('\n== Revenue (new sub-accounts) ==');
  {
    const revenueId = await ensureCategoryId('Revenue', AccountType.REVENUE);
    await seedRows(createdById, revenueId, AccountType.REVENUE, [
      ['Debit Note', 1, 'CR'],
    ]);
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
      ['M.Safdar Brokar', 35000, 'DR'],
      ['Allah Dittah Thekedar', 4625, 'DR'],
    ]);
  }

  console.log('\n== Accounts Payable (new category) ==');
  {
    const id = await ensureCategoryId('Accounts Payable', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['Mohsin Ashraf Bank Al-Habib', 5000000, 'CR'],
      ['MOHSIN ASHRAF SB.13/G CTN', 1000000, 'DR'],
      ['Zouja Iftkhar Ahmad', 446126, 'CR'],
    ]);
  }

  console.log('\n== Miscellaneous Expenses (new category) ==');
  {
    const id = await ensureCategoryId('Miscellaneous Expenses', AccountType.EXPENSE);
    await seedRows(createdById, id, AccountType.EXPENSE, [
      ['Sadqah', 831290, 'DR'],
      ['Z', 143600, 'DR'],
    ]);
  }

  console.log('\n== Staff Member (new category) ==');
  {
    const id = await ensureCategoryId('Staff Member', AccountType.ASSET);
    await seedRows(createdById, id, AccountType.ASSET, [
      ['Muhammad Rafique', 205079, 'DR'],
      ['Muhammad shafiq Acc.', 18000, 'DR'],
    ]);
  }

  // ── 7. Existing party categories — full account lists ──
  console.log('\n== Sale Party (existing category) ==');
  {
    const id = await ensureCategoryId('Sale Party', AccountType.ASSET);
    await seedRows(createdById, id, AccountType.ASSET, [
      ['Billal Wahid Flour Mills', 35955, 'DR'],
      ['AL-Habib Flour Mills', 165258, 'CR'],
      ['Al-Rahmat Rice Mills', 5060, 'DR'],
      ['Mian Umar Sharif Flour Mills', 118548, 'DR'],
      ['Geelani Flour Mills', 31063, 'DR'],
    ]);
  }

  console.log('\n== Ext. Purchase Party (existing category) ==');
  {
    const id = await ensureCategoryId('Ext. Purchase Party', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['MEEZAN BANK ATC-519', 4048271, 'CR'],
      ['M.Ishtiaq 54/F', 206, 'CR'],
      ['M.Ijaz Anjum Thaheem', 35420, 'DR'],
      ['CROWN EV Center Bahawalnagar', 3862000, 'DR'],
      ['Rajab Ali S/O M.Yar Arian', 46312, 'DR'],
      ['Hafiz Ghafoor Ahmad S/o Noor Ahmad', 2025000, 'DR'],
      ['Al-Haram Oil Mills', 336159, 'DR'],
      ['Arif Hussain Bajwah', 290, 'CR'],
      ['Mian Manzoor Ahmad S/O Ghulam Nabi', 15000000, 'CR'],
      ['Arain goods Hasilpur', 3000, 'CR'],
      ['Muneer Ahmad Rahmani Jamal Pur', 113500, 'DR'],
      ['M.Imtiaz Khan Lakhwera', 224914, 'DR'],
      ['Ghulam Mustafa khad farosh', 447300, 'CR'],
      ['Mumtaz Ahmad Arain S/o M.Fiaz Saleem Kot', 529, 'CR'],
      ['Mian M.Akram Matyana SB', 56486, 'CR'],
      ['M.Akbar S/O Basheer Jut', 8340, 'DR'],
      ['Hafiz M.Yaseen Bhae', 2731228, 'CR'],
      ['Abd Ul Latif Shah Abbas', 5000, 'DR'],
      ['Sufi M.Saleem Ullah', 24367146, 'DR'],
      ['Qari M.Ahmad Baloch', 36419, 'DR'],
      ['Common Default Accounts', 70270, 'CR'],
      ['Sufi M.Iqbal Bhae', 918779, 'CR'],
      ['Shahzad Araien S/o G.Farid', 2025, 'CR'],
      ['Fouji M.Asghar', 300, 'CR'],
      ['White Gold Cotton IND.', 1, 'CR'],
      ['Hafiz M.Kamran Zamindara Colony', 451275, 'CR'],
      ['Bhae M.ILYAS JAJJA SB.', 285161, 'DR'],
      ['Expences Of Al-Haram Oil Mills', 323204, 'DR'],
      ['Nasr Ullah R Head Master', 85000, 'DR'],
      ['Qari Farhan s/o Master Idrees', 150065, 'CR'],
      ['M.Asad Aslam Mahar sharif', 900, 'CR'],
      ['M.Abid Setlite Town', 874, 'DR'],
      ['Rokdee Khatah', 43, 'DR'],
      ['Abd Ul Sattar Dhudhe', 53, 'CR'],
      ['M.Azeem S/O M Akhtar', 735, 'CR'],
      ['Noor Ahmad S/O Faqeer Muhammad 2/g', 51015, 'DR'],
      ['Bholla Hotal Wala', 5000, 'DR'],
      ['M.Riaz Jar Palledar', 8, 'DR'],
      ['M.Yaseen S/ O Allah Dittah Hamaon', 1, 'CR'],
      ['Basheer Ahmad S/O Haji M Yaar', 1000, 'DR'],
      ['Aziz Urrahman Kamboh 30/G', 6, 'CR'],
      ['Allah Dittah (A D )', 10000, 'DR'],
      ['M.Tufail Sukhera Chak Abdullah', 759, 'DR'],
      ['M.Yousuf Tali Wala Khoh', 9, 'CR'],
      ['Qari Ghulam Murtaza SB', 140000, 'DR'],
      ['M.Zafar S/O M Shareef Ihata Pathan Wala', 163, 'CR'],
      ['M.Sarwar S/O M.shafee 13 / G', 104, 'CR'],
      ['M.Mushtaq S/O Ahmad Ali', 119, 'CR'],
      ['M.Shahzad 47/ F', 614, 'CR'],
      ['Qayyum Kharal', 4200, 'DR'],
      ['M.Ahmad Nadeem', 411145, 'DR'],
      ['M. Iqbal S/O Muhammad yar Bhadeerah', 10000, 'DR'],
      ['Muhammad Shafique 9 / G', 21829, 'CR'],
      ['Allah Rakha Basti Bhoora', 663, 'CR'],
      ['Qari Zia Ullah', 180, 'DR'],
      ['Plot Ittefaq City', 15099, 'DR'],
      ['Suddam S/O M Shareef Noshahra', 25, 'CR'],
      ['Muzzammil Ali S / O Hakam Ali', 500000, 'CR'],
      ['Fouji M Irfan', 2, 'CR'],
      ['Abdul Ghafoor Basti Noshahra', 600849, 'CR'],
      ['Meezan Bank AUM-639', 4059780, 'CR'],
      ['New Hall Construction G-Batool', 446771, 'DR'],
      ['M.Asif bhanja Bakhshan khan', 670, 'DR'],
      ['Hadi EV Cente Investment', 3500000, 'DR'],
      ['Haji Saeed SB', 180, 'CR'],
      ['M.UmerFarooq Bhanja SO/Nawaz', 400000, 'CR'],
    ]);
  }

  console.log('\n== Int. Purchase Party (existing category) ==');
  {
    const id = await ensureCategoryId('Int. Purchase Party', AccountType.LIABILITY);
    await seedRows(createdById, id, AccountType.LIABILITY, [
      ['Osama Agri produce', 7959873, 'CR'],
      ['M.Hanif & Sons', 430301, 'CR'],
      ['M.Basheer & Company', 486613, 'CR'],
      ['Al-Ghani Corporation', 593700, 'CR'],
      ['Hassan Traders', 605279, 'CR'],
      ['Haji Shair M.Khurshaid Alam', 1858626, 'CR'],
      ['Hassan Tahir & Co', 1137023, 'CR'],
      ['Rahmat Ali M.Javed', 61582, 'CR'],
      ['Randhawa Traders', 315239, 'CR'],
      ['Umer Farooq & Brothers', 460838, 'CR'],
      ['Master Corporation', 116840, 'CR'],
      ['Haji Asmat Ullah & Sons', 49085, 'CR'],
      ['Akram Shareef Corporation', 16257, 'CR'],
      ['Fawad Cotton Ginners', 1, 'DR'],
      ['Fareedi Corporation', 183261, 'CR'],
      ['Al-Habib Corporation', 80594, 'CR'],
      ['Hafiz Kashif &Co', 1, 'CR'],
      ['Tawakal Commission Shop', 9, 'DR'],
      ['Mehmood Corporation', 1217, 'CR'],
      ['Ali Raza & Company', 1, 'CR'],
      ['Ahmad Corporation', 2489, 'CR'],
      ['Sahibzada & Company', 148574, 'CR'],
      ['Chishtian Agro Services', 386105, 'CR'],
      ['Ali Umair Traders', 1, 'CR'],
      ['Ch.Rahmat Ali ShahMuhammad', 139751, 'CR'],
      ['Panjab Trading Carporation', 1, 'DR'],
      ['Sheikh Muddassar Ishaaq & Co', 195148, 'CR'],
      ['Ali Traders', 4, 'CR'],
      ['Asif Corporation', 142299, 'DR'],
      ['Malik Anait Ullah', 2353, 'DR'],
      ['SUFI & CO', 83847, 'DR'],
      ['Shadab Agri Forms', 54903, 'CR'],
      ['Al-Muneer Corporation', 103378, 'CR'],
      ['Mustafa Coton Ginners', 203, 'DR'],
      ['Usman Trader', 288011, 'CR'],
      ['maintainance Account', 46949, 'DR'],
      ['Geelani Brothers', 2, 'DR'],
      ['Arslan Traders', 61499, 'CR'],
      ['Al-Barkat Traders', 13200, 'CR'],
      ['Aleem & Co', 718538, 'CR'],
      ['Saqib Traders', 663816, 'CR'],
      ['Fiaz Ahmad Ageri Produce', 1, 'CR'],
      ['Malik Muhammad Shafee Abdul Ghaffar', 303, 'DR'],
      ['Haji Muhammad Ameen & Sons', 348, 'DR'],
      ['Musa Agri Produce', 545199, 'CR'],
      ['Syed Hassan Shah Agri Produce', 1, 'CR'],
      ['Awami.Corporation', 25, 'CR'],
      ['Sindhu.Agri produce', 1, 'CR'],
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
