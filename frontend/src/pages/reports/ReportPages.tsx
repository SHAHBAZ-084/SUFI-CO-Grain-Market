import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageShell, Panel } from '../../components/ui/PageShell';

export function AccountReportsPage() {
  const [accounts, setAccounts] = useState<{ id: number; name: string; code: string }[]>([]);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  return (
    <PageShell title="Account Reports" subtitle="Chart of accounts overview">
      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="py-2">Code</th>
              <th className="py-2">Account</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-stone-100">
                <td className="py-2">{a.code}</td>
                <td className="py-2">{a.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </PageShell>
  );
}

export function TrialBalancePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTrialBalance>> | null>(null);

  useEffect(() => {
    api.getTrialBalance().then(setData).catch(() => setData(null));
  }, []);

  return (
    <PageShell title="Detail Trial Balance" subtitle="Debit and credit totals by account">
      <Panel>
        {data ? (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2">Account</th>
                  <th className="py-2 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    <td className="py-2">{row.accountName}</td>
                    <td className="py-2 text-right">{row.debit.toFixed(2)}</td>
                    <td className="py-2 text-right">{row.credit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-stone-600">
              Total debit {data.totalDebit.toFixed(2)} · Total credit {data.totalCredit.toFixed(2)} ·{' '}
              {data.isBalanced ? 'Balanced' : 'Out of balance'}
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-500">Loading…</p>
        )}
      </Panel>
    </PageShell>
  );
}

export function SalePurchaseReportsPage() {
  return (
    <PageShell title="Sale/Purchase Reports" subtitle="Combined invoice reporting">
      <Panel>
        <p className="text-sm text-stone-600">
          Use <strong>View Previous Bill</strong> under Sale/Purchase Invoice for the unified history.
          Detailed sale/purchase analytics will be added with invoice posting rules.
        </p>
      </Panel>
    </PageShell>
  );
}
