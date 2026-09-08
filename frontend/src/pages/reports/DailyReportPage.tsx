import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FieldLabel,
  FinancialButton,
  LegacyTable,
  PageShell,
  Panel,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { api } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';

type DailyFilterKey =
  | 'all'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'KACHI_MAAL'
  | 'PURCHASE_MAAL'
  | 'SALE_PAUNCH'
  | 'SALE_COMMISSION'
  | 'PURCHASE_GENERAL'
  | 'SALE_GENERAL';

type DailyRow = Awaited<ReturnType<typeof api.getDailyReport>>['rows'][number];

const KIND_FILTERS: Array<{ value: DailyFilterKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'JOURNAL', label: 'Journal' },
  { value: 'KACHI_MAAL', label: 'Kachi Maal' },
  { value: 'PURCHASE_MAAL', label: 'Purchase Maal' },
  { value: 'SALE_PAUNCH', label: 'Sale Paunch' },
  { value: 'SALE_COMMISSION', label: 'Sale Commission' },
  { value: 'PURCHASE_GENERAL', label: 'Purchase Invoice' },
  { value: 'SALE_GENERAL', label: 'Sale Invoice' },
];

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function accountCellLabel(account: { name: string; code: string } | null | undefined) {
  if (!account) return '—';
  return account.code ? `${account.name} (${account.code})` : account.name;
}

function viewHref(row: DailyRow): string | null {
  if (row.kind === 'voucher' && row.voucherType && row.voucherNumber != null) {
    const params = new URLSearchParams({
      type: row.voucherType,
      number: String(row.voucherNumber),
    });
    return `/vouchers/view?${params.toString()}`;
  }
  if (row.kind === 'invoice' && row.invoiceType && row.invoiceNumber != null) {
    const params = new URLSearchParams({
      type: row.invoiceType,
      number: String(row.invoiceNumber),
    });
    return `/invoices/view-invoice?${params.toString()}`;
  }
  return null;
}

export function DailyReportPage() {
  const [date, setDate] = useState(todayInputValue);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<DailyFilterKey>('all');

  const loadReport = useCallback(async (day: string) => {
    if (!day) {
      setError('Select a date');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.getDailyReport({ date: day });
      setRows(result.rows);
      setLoaded(true);
      setKindFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily report');
      setRows([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(date);
  }, [date, loadReport]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadReport(date);
  }

  const filteredRows = useMemo(
    () => (kindFilter === 'all' ? rows : rows.filter((row) => row.filterKey === kindFilter)),
    [rows, kindFilter],
  );

  const filteredTotals = useMemo(
    () => ({
      count: filteredRows.length,
      amount: filteredRows.reduce((sum, row) => sum + row.amount, 0),
    }),
    [filteredRows],
  );

  return (
    <PageShell
      title="Daily Report"
      subtitle="Posted vouchers and invoices for a single day"
    >
      <Panel className="mb-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <FinancialButton type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'View'}
          </FinancialButton>
        </form>
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((filter) => (
          <SecondaryButton
            key={filter.value}
            type="button"
            className={kindFilter === filter.value ? 'ring-2 ring-accent' : ''}
            onClick={() => setKindFilter(filter.value)}
            disabled={!loaded || loading}
          >
            {filter.label}
            {filter.value === 'all'
              ? ` (${rows.length})`
              : ` (${rows.filter((row) => row.filterKey === filter.value).length})`}
          </SecondaryButton>
        ))}
        <SecondaryButton
          type="button"
          className="ml-auto"
          onClick={() => void loadReport(date)}
          disabled={loading}
        >
          Refresh
        </SecondaryButton>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {loaded && !error ? (
        <p className="mb-3 text-sm text-textSecondary">
          {filteredTotals.count} record{filteredTotals.count === 1 ? '' : 's'} · Total{' '}
          {formatLedgerAmount(filteredTotals.amount)}
        </p>
      ) : null}

      <Panel className="p-0">
        {loading && !loaded ? (
          <p className="p-4 text-sm text-textMuted">Loading…</p>
        ) : !loaded ? null : filteredRows.length === 0 ? (
          <p className="p-4 text-sm text-textMuted">No posted work for this date.</p>
        ) : (
          <LegacyTable className="border-0">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Debit Account</th>
                <th>Credit Account</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const href = viewHref(row);
                return (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>{row.kind === 'voucher' ? 'Voucher' : 'Invoice'}</td>
                    <td>{row.typeLabel}</td>
                    <td>{row.reference}</td>
                    <td>{accountCellLabel(row.debitAccount)}</td>
                    <td>{accountCellLabel(row.creditAccount)}</td>
                    <td className="text-right tabular-nums">{formatLedgerAmount(row.amount)}</td>
                    <td className="text-right">
                      {href ? (
                        <Link to={href} className="text-sm font-medium text-financial hover:underline">
                          View
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </LegacyTable>
        )}
      </Panel>
    </PageShell>
  );
}
