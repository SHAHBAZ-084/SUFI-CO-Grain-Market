import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOP_NAV } from '../config/navigation';
import { PageShell, PrimaryButton, Tile } from '../components/ui/PageShell';
import { api } from '../lib/api';
import { formatLedgerAmount, formatVoucherLabel } from '../lib/format';

type DashboardSummary = Awaited<ReturnType<typeof api.getDashboardSummary>>;

function MetricCard({
  label,
  value,
  valueClassName = 'text-textPrimary',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Tile>
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className={`mt-1 text-[22px] font-medium leading-tight ${valueClassName}`}>{value}</p>
    </Tile>
  );
}

function voucherTypeClass(type: string) {
  if (type === 'RECEIPT') return 'text-success';
  if (type === 'PAYMENT') return 'text-danger';
  return 'text-textMuted';
}

export function PosHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  const invoiceLinks = (
    TOP_NAV.find((g) => g.label === 'Sale/Purchase Invoice')?.children ?? []
  ).filter((item): item is { kind: 'link'; label: string; to: string; description?: string } => item.kind === 'link' && item.to !== '/invoices/history');

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  return (
    <PageShell title="Dashboard" subtitle="Today at a glance">
      {loadError ? <p className="mb-4 text-sm text-danger">{loadError}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Cash Balance"
          value={summary ? formatLedgerAmount(summary.cashBalance) : '—'}
          valueClassName="text-success"
        />
        <MetricCard
          label="Receivables"
          value={summary ? formatLedgerAmount(summary.receivables) : '—'}
          valueClassName="text-success"
        />
        <MetricCard
          label="Payables"
          value={summary ? formatLedgerAmount(summary.payables) : '—'}
          valueClassName="text-danger"
        />
        <MetricCard
          label="Vouchers Today"
          value={summary ? String(summary.vouchersToday) : '—'}
        />
      </div>

      <Tile className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-textPrimary">Recent vouchers</h2>
          <Link to="/vouchers/receipt">
            <PrimaryButton type="button">New voucher</PrimaryButton>
          </Link>
        </div>

        {!summary ? (
          <p className="text-sm text-textMuted">Loading…</p>
        ) : summary.recentVouchers.length === 0 ? (
          <p className="text-sm text-textMuted">No vouchers posted yet this year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-textMuted">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentVouchers.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-textPrimary">
                      {formatVoucherLabel(v.type, v.number)}
                    </td>
                    <td className="py-2 pr-3 text-textSecondary">{v.accountLabel}</td>
                    <td className={`py-2 pr-3 font-medium ${voucherTypeClass(v.type)}`}>
                      {v.type === 'RECEIPT' ? 'Receipt' : v.type === 'PAYMENT' ? 'Payment' : 'Journal'}
                    </td>
                    <td className="py-2 text-right font-medium text-textPrimary">
                      {formatLedgerAmount(v.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-onCanvasMuted">Invoices</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {invoiceLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-lg border border-borderStrong bg-surface2 p-3 shadow-md transition hover:border-accent"
            >
              <h3 className="text-sm font-medium text-textPrimary">{link.label}</h3>
              <p className="mt-1 text-xs text-textMuted">Open invoice form</p>
            </Link>
          ))}
          <Link
            to="/invoices/history"
            className="rounded-lg border border-borderStrong bg-surface2 p-3 shadow-md transition hover:border-accent"
          >
            <h3 className="text-sm font-medium text-textPrimary">View Previous Bill</h3>
            <p className="mt-1 text-xs text-textMuted">All invoice types in one list</p>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
