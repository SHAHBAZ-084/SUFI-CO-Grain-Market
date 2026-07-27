import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { TOP_NAV } from '../config/navigation';
import { PageShell, Tile } from '../components/ui/PageShell';
import { api } from '../lib/api';
import { formatLedgerAmount, formatVoucherNumber, formatVoucherTypeLabel, voucherTypeColorClass } from '../lib/format';

type DashboardSummary = Awaited<ReturnType<typeof api.getDashboardSummary>>;

type MetricTone = 'cash' | 'receivables' | 'payables' | 'vouchers';

const METRIC_STYLES: Record<
  MetricTone,
  { card: string; value: string; badge: string; icon: LucideIcon }
> = {
  cash: {
    card: 'border-l-4 border-metricCashAccent bg-metricCashBg',
    value: 'text-metricCashAccent',
    badge: 'bg-[color-mix(in_srgb,var(--metric-cash-accent)_14%,var(--surface-2))] text-metricCashAccent',
    icon: Wallet,
  },
  receivables: {
    card: 'border-l-4 border-metricReceivablesAccent bg-metricReceivablesBg',
    value: 'text-metricReceivablesAccent',
    badge:
      'bg-[color-mix(in_srgb,var(--metric-receivables-accent)_14%,var(--surface-2))] text-metricReceivablesAccent',
    icon: ArrowDownCircle,
  },
  payables: {
    card: 'border-l-4 border-metricPayablesAccent bg-metricPayablesBg',
    value: 'text-metricPayablesAccent',
    badge: 'bg-[color-mix(in_srgb,var(--metric-payables-accent)_14%,var(--surface-2))] text-metricPayablesAccent',
    icon: ArrowUpCircle,
  },
  vouchers: {
    card: 'border-l-4 border-metricVouchersAccent bg-metricVouchersBg',
    value: 'text-metricVouchersAccent',
    badge:
      'bg-[color-mix(in_srgb,var(--metric-vouchers-accent)_14%,var(--surface-2))] text-metricVouchersAccent',
    icon: Receipt,
  },
};

const INVOICE_CARD_STYLES: Record<string, { card: string; title: string }> = {
  '/invoices/sale-commission': {
    card: 'border-l-4 border-cardSaleCommissionAccent bg-cardSaleCommissionBg hover:border-cardSaleCommissionAccent',
    title: 'text-cardSaleCommissionAccent',
  },
  '/invoices/sale-paunch': {
    card: 'border-l-4 border-cardSalePaunchAccent bg-cardSalePaunchBg hover:border-cardSalePaunchAccent',
    title: 'text-cardSalePaunchAccent',
  },
  '/invoices/purchase-maal': {
    card: 'border-l-4 border-cardPurchaseMaalAccent bg-cardPurchaseMaalBg hover:border-cardPurchaseMaalAccent',
    title: 'text-cardPurchaseMaalAccent',
  },
  '/invoices/kachi-maal': {
    card: 'border-l-4 border-cardKachiMaalAccent bg-cardKachiMaalBg hover:border-cardKachiMaalAccent',
    title: 'text-cardKachiMaalAccent',
  },
  '/invoices/history': {
    card: 'border-l-4 border-cardInvoiceHistoryAccent bg-cardInvoiceHistoryBg hover:border-cardInvoiceHistoryAccent',
    title: 'text-cardInvoiceHistoryAccent',
  },
};

const VOUCHER_ACTIONS = [
  { label: 'Payment Voucher', to: '/vouchers/payment', card: 'border-l-4 border-voucherPayment bg-bgDanger hover:border-voucherPayment', title: 'text-voucherPayment' },
  { label: 'Receipt Voucher', to: '/vouchers/receipt', card: 'border-l-4 border-voucherReceipt bg-bgSuccess hover:border-voucherReceipt', title: 'text-voucherReceipt' },
  { label: 'Journal Voucher', to: '/vouchers/journal', card: 'border-l-4 border-voucherJournal bg-bgAccent hover:border-voucherJournal', title: 'text-voucherJournal' },
] as const;

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: MetricTone;
}) {
  const style = METRIC_STYLES[tone];
  const Icon = style.icon;
  return (
    <Tile
      className={`relative min-h-[6.5rem] !p-4 transition-shadow hover:shadow-md ${style.card}`}
    >
      <div
        className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full ${style.badge}`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="pr-12">
        <p className="text-xs font-medium text-textSecondary">{label}</p>
        <p className={`mt-2 text-[22px] font-semibold leading-tight ${style.value}`}>{value}</p>
      </div>
    </Tile>
  );
}

function ActionCard({
  to,
  title,
  description,
  cardClassName,
  titleClassName,
}: {
  to: string;
  title: string;
  description: string;
  cardClassName: string;
  titleClassName: string;
}) {
  return (
    <Link
      to={to}
      className={`rounded-lg border border-border p-3 shadow-sm transition ${cardClassName}`}
    >
      <h3 className={`text-sm font-semibold ${titleClassName}`}>{title}</h3>
      <p className="mt-1 text-xs text-textSecondary">{description}</p>
    </Link>
  );
}

export function PosHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  const invoiceLinks = (
    TOP_NAV.find((g) => g.label === 'Sale/Purchase Invoice')?.children ?? []
  ).filter((item): item is { kind: 'link'; label: string; to: string; description?: string } => item.kind === 'link');

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
          tone="cash"
        />
        <MetricCard
          label="Receivables"
          value={summary ? formatLedgerAmount(summary.receivables) : '—'}
          tone="receivables"
        />
        <MetricCard
          label="Payables"
          value={summary ? formatLedgerAmount(summary.payables) : '—'}
          tone="payables"
        />
        <MetricCard
          label="Vouchers Today"
          value={summary ? String(summary.vouchersToday) : '—'}
          tone="vouchers"
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">New voucher</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VOUCHER_ACTIONS.map((action) => (
            <ActionCard
              key={action.to}
              to={action.to}
              title={action.label}
              description="Open voucher form"
              cardClassName={action.card}
              titleClassName={action.title}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Invoices</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {invoiceLinks.map((link) => {
            const style = INVOICE_CARD_STYLES[link.to] ?? INVOICE_CARD_STYLES['/invoices/history'];
            return (
              <ActionCard
                key={link.to}
                to={link.to}
                title={link.label}
                description={link.to === '/invoices/history' ? 'All invoice types in one list' : 'Open invoice form'}
                cardClassName={style.card}
                titleClassName={style.title}
              />
            );
          })}
        </div>
      </div>

      <Tile className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-textPrimary">Recent vouchers</h2>

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
                    <td className="py-2 pr-3 font-mono text-xs font-semibold text-financial">
                      {formatVoucherNumber(v.number, v.type)}
                    </td>
                    <td className="py-2 pr-3 text-textSecondary">{v.accountLabel}</td>
                    <td className={`py-2 pr-3 font-medium ${voucherTypeColorClass(v.type)}`}>
                      {formatVoucherTypeLabel(v.type)}
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
    </PageShell>
  );
}
