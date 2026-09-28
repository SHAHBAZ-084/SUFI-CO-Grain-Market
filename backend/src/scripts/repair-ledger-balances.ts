/**
 * One-shot: recompute all Ledger.balance values from entries for the active FY,
 * then zero out leftover RPAG test accounts that have balance with no entries.
 *
 * Run: npx tsx src/scripts/repair-ledger-balances.ts
 */
import { prisma } from '../lib/prisma';
import { getTrialBalance, repairAllLedgerBalances } from '../modules/accounting/accounting.service';

async function main() {
  console.log('Repairing ledger balances…');
  const result = await repairAllLedgerBalances();
  console.log(result);

  // Clear junk test accounts left by report-pagination tests (balance, zero entries).
  const junk = await prisma.account.findMany({
    where: {
      OR: [
        { name: { startsWith: 'RPAG Hidden' } },
        { name: { startsWith: 'Numbering Product' } },
      ],
    },
    include: { ledger: { include: { _count: { select: { entries: true } } } } },
  });

  let junkCleared = 0;
  for (const account of junk) {
    const ledger = account.ledger;
    if (!ledger) continue;
    const entryCount = ledger._count.entries;
    const balance = Number(ledger.balance);
    // Only wipe balance when there are no real entries, or name is clearly a test remnant.
    if (entryCount === 0 && Math.abs(balance) > 0.005) {
      await prisma.ledger.update({ where: { id: ledger.id }, data: { balance: 0 } });
      junkCleared += 1;
      console.log(`Cleared junk balance on ${account.name}: was ${balance}`);
    }
  }

  const tb = await getTrialBalance(result.financialYearId);
  console.log({
    junkCleared,
    totalDebit: tb.totalDebit,
    totalCredit: tb.totalCredit,
    mismatch: Math.abs(tb.totalDebit - tb.totalCredit),
    isBalanced: tb.isBalanced,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
