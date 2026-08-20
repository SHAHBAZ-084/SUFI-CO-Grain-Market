import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { INVOICE_QUICK_LINKS, REPORT_QUICK_LINKS, VOUCHER_QUICK_LINKS } from '../config/navigation';
import { defaultCardDescription, QuickLinkCard } from '../components/ui/QuickLinkCard';
import { LegacyTable, PageShell, Tile } from '../components/ui/PageShell';
import { api } from '../lib/api';
import { formatLedgerAmount, formatVoucherNumber, formatVoucherTypeLabel, voucherTypeColorClass } from '../lib/format';

type DashboardSummary = Awaited<ReturnType<typeof api.getDashboardSummary>>;

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Tile className="min-h-[4.5rem]">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-textMuted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-financial">{value}</p>
    </Tile>
  );
}

export function PosHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  return (
    <PageShell subtitle="Today at a glance">
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          label="Cash Balance"
          value={summary ? formatLedgerAmount(summary.cashBalance) : '—'}
        />
        <Tile className="min-h-[4.5rem] sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-textMuted">
              Stock bags
            </p>
            <Link to="/reports/stock" className="text-xs font-medium text-financial hover:underline">
              Stock Report
            </Link>
          </div>
          {!summary ? (
            <p className="mt-2 text-sm text-textMuted">Loading…</p>
          ) : summary.productStock.length === 0 ? (
            <p className="mt-2 text-sm text-textMuted">No bag stock yet.</p>
          ) : (
            <div className="mt-2 max-h-36 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-textSecondary">
                    <th className="pb-1 pr-2 font-medium">Product</th>
                    <th className="pb-1 pr-2 text-right font-medium">Bori</th>
                    <th className="pb-1 text-right font-medium">Thela</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.productStock.map((row) => (
                    <tr key={row.productId} className="border-t border-border">
                      <td className="py-1 pr-2 text-textPrimary">{row.name}</td>
                      <td className="py-1 pr-2 text-right tabular-nums font-medium text-financial">
                        {row.bori}
                      </td>
                      <td className="py-1 text-right tabular-nums font-medium text-financial">
                        {row.thela}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tile>
        <StatBox
          label="Vouchers Today"
          value={summary ? String(summary.vouchersToday) : '—'}
        />
      </div>

      <div>
        <h2 className="legacy-section-title">New Voucher</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VOUCHER_QUICK_LINKS.map((link) => (
            <QuickLinkCard
              key={link.to}
              to={link.to}
              title={link.label}
              description={defaultCardDescription(link.to)}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="legacy-section-title">Invoices</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INVOICE_QUICK_LINKS.map((link) => (
            <QuickLinkCard
              key={link.to}
              to={link.to}
              title={link.label}
              description={defaultCardDescription(link.to)}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="legacy-section-title">Reports</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_QUICK_LINKS.map((link) => (
            <QuickLinkCard
              key={link.to}
              to={link.to}
              title={link.label}
              description={defaultCardDescription(link.to)}
            />
          ))}
        </div>
      </div>

      <PanelSection summary={summary} />
    </PageShell>
  );
}

function PanelSection({ summary }: { summary: DashboardSummary | null }) {
  return (
    <div>
      <h2 className="legacy-section-title">Recent Vouchers</h2>
      {!summary ? (
        <p className="text-sm text-textMuted">Loading…</p>
      ) : summary.recentVouchers.length === 0 ? (
        <p className="text-sm text-textMuted">No vouchers posted yet this year.</p>
      ) : (
        <LegacyTable>
          <thead>
            <tr>
              <th>#</th>
              <th>Account</th>
              <th>Type</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentVouchers.map((v) => (
              <tr key={v.id}>
                <td className="font-mono text-xs font-semibold text-financial">
                  {formatVoucherNumber(v.number, v.type)}
                </td>
                <td>{v.accountLabel}</td>
                <td className={`font-medium ${voucherTypeColorClass(v.type)}`}>
                  {formatVoucherTypeLabel(v.type)}
                </td>
                <td className="text-right font-medium tabular-nums">{formatLedgerAmount(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </LegacyTable>
      )}
    </div>
  );
}
