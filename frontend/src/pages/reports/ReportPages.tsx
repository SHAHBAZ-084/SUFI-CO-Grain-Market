import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatLedgerAmount, formatLedgerBalance } from '../../lib/format';
import { downloadExcel, downloadPdf } from '../../lib/reportExport';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/PageShell';

type LedgerResult = Awaited<ReturnType<typeof api.getLedger>>;

export function AccountReportsPage() {
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [accountId, setAccountId] = useState<number | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listAccounts().then((rows) => setAccounts(rows.map(({ id, name }) => ({ id, name })))).catch(() => setAccounts([]));
  }, []);

  async function loadLedger() {
    if (!accountId) {
      setError('Select an account');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await api.getLedger(Number(accountId), {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setLedger(result);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
      setLedger(null);
    } finally {
      setLoading(false);
    }
  }

  function exportLedger(format: 'pdf' | 'excel') {
    if (!ledger) return;
    const accountName = ledger.account.name;
    const period = [fromDate, toDate].filter(Boolean).join(' to ') || 'All dates';
    const title = `Account Ledger — ${accountName} (${period})`;
    const headers = ['Date', 'Voucher#', 'Ref#', 'Type', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = ledger.rows.map((r) => [
      formatDate(r.date),
      r.voucherNo,
      r.ref ?? '',
      r.type,
      r.description,
      r.debit > 0 ? formatLedgerAmount(r.debit) : '',
      r.credit > 0 ? formatLedgerAmount(r.credit) : '',
      formatLedgerBalance(r.balance),
    ]);
    rows.push([
      'Total / Closing',
      '',
      '',
      '',
      '',
      formatLedgerAmount(ledger.summary.totalDebit),
      formatLedgerAmount(ledger.summary.totalCredit),
      formatLedgerBalance(ledger.summary.closingBalance),
    ]);
    const safeName = accountName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const base = `ledger-${safeName || 'account'}`;
    if (format === 'excel') {
      downloadExcel(`${base}.xlsx`, 'Ledger', headers, rows);
    } else {
      downloadPdf(`${base}.pdf`, title, headers, rows);
    }
  }

  return (
    <PageShell title="Account Reports" subtitle="View ledger entries for any account">
      <Panel>
        <h2 className="mb-4 text-lg font-semibold text-textPrimary">Account Ledger</h2>
        <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <FieldLabel>Account</FieldLabel>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>From date</FieldLabel>
            <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel>To date</FieldLabel>
            <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <PrimaryButton type="button" onClick={loadLedger} disabled={loading}>
            {loading ? 'Loading…' : 'Load Ledger'}
          </PrimaryButton>
        </div>

        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

        {!loaded ? (
          <p className="text-sm text-textSecondary">Select an account and click Load Ledger</p>
        ) : ledger && ledger.rows.length === 0 ? (
          <p className="text-sm text-textSecondary">No entries in this period</p>
        ) : ledger ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => exportLedger('pdf')}>Download PDF</SecondaryButton>
              <SecondaryButton type="button" onClick={() => exportLedger('excel')}>Download Excel</SecondaryButton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-textSecondary">
                    <th className="py-2">Date</th>
                    <th className="py-2">Voucher#</th>
                    <th className="py-2">Ref#</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((r, i) => (
                    <tr key={i} className={`border-b border-border ${r.isOpeningRow ? 'bg-surface1 font-medium' : ''}`}>
                      <td className="py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="py-2 font-mono text-xs">{r.voucherNo}</td>
                      <td className="py-2 text-textSecondary">{r.ref ?? ''}</td>
                      <td className="py-2">{r.type}</td>
                      <td className="py-2 text-textSecondary">{r.description}</td>
                      <td className="py-2 text-right">{r.debit > 0 ? formatLedgerAmount(r.debit) : ''}</td>
                      <td className="py-2 text-right">{r.credit > 0 ? formatLedgerAmount(r.credit) : ''}</td>
                      <td className="py-2 text-right font-medium text-accent">{formatLedgerBalance(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2" colSpan={5}>Total / Closing</td>
                    <td className="py-2 text-right">{formatLedgerAmount(ledger.summary.totalDebit)}</td>
                    <td className="py-2 text-right">{formatLedgerAmount(ledger.summary.totalCredit)}</td>
                    <td className="py-2 text-right text-accent">{formatLedgerBalance(ledger.summary.closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : null}
      </Panel>
    </PageShell>
  );
}

export function TrialBalancePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTrialBalance>> | null>(null);

  useEffect(() => {
    api.getTrialBalance().then(setData).catch(() => setData(null));
  }, []);

  function exportTrialBalance(format: 'pdf' | 'excel') {
    if (!data) return;
    const headers = ['Account', 'Debit', 'Credit'];
    const rows = data.accounts.map((row) => [
      row.accountName,
      row.debit.toFixed(2),
      row.credit.toFixed(2),
    ]);
    rows.push(['Total', data.totalDebit.toFixed(2), data.totalCredit.toFixed(2)]);
    const title = `Detail Trial Balance${data.isBalanced ? '' : ' (Out of balance)'}`;
    if (format === 'excel') {
      downloadExcel('trial-balance.xlsx', 'Trial Balance', headers, rows);
    } else {
      downloadPdf('trial-balance.pdf', title, headers, rows);
    }
  }

  return (
    <PageShell title="Detail Trial Balance" subtitle="Debit and credit totals by account">
      <Panel>
        {data ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => exportTrialBalance('pdf')}>Download PDF</SecondaryButton>
              <SecondaryButton type="button" onClick={() => exportTrialBalance('excel')}>Download Excel</SecondaryButton>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-textSecondary">
                  <th className="py-2">Account</th>
                  <th className="py-2 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2">{row.accountName}</td>
                    <td className="py-2 text-right">{row.debit.toFixed(2)}</td>
                    <td className="py-2 text-right">{row.credit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-textSecondary">
              Total debit {data.totalDebit.toFixed(2)} · Total credit {data.totalCredit.toFixed(2)} ·{' '}
              {data.isBalanced ? 'Balanced' : 'Out of balance'}
            </p>
          </>
        ) : (
          <p className="text-sm text-textSecondary">Loading…</p>
        )}
      </Panel>
    </PageShell>
  );
}

export function SalePurchaseReportsPage() {
  return (
    <PageShell title="Sale/Purchase Reports" subtitle="Combined invoice reporting">
      <Panel>
        <p className="text-sm text-textSecondary">
          Use <strong>View Previous Bill</strong> under Sale/Purchase Invoice for the unified history.
          Detailed sale/purchase analytics will be added with invoice posting rules.
        </p>
      </Panel>
    </PageShell>
  );
}
