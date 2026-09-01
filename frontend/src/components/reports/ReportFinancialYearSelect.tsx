import { useEffect, useState } from 'react';
import { api, type FinancialYear } from '../../lib/api';
import { FieldLabel } from '../ui/PageShell';
import { SearchSelect } from '../ui/SearchSelect';

export function financialYearOptionLabel(year: FinancialYear): string {
  const status = year.status === 'ACTIVE' ? 'Active' : 'Closed';
  return `${year.label} (${status})`;
}

/** Shared Financial Year dropdown for Reports pages only. */
export function useReportFinancialYears() {
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listFinancialYears()
      .then((rows) => {
        if (cancelled) return;
        setYears(rows);
        const active = rows.find((y) => y.status === 'ACTIVE');
        setFinancialYearId(String(active?.id ?? rows[0]?.id ?? ''));
      })
      .catch(() => {
        if (cancelled) return;
        setYears([]);
        setFinancialYearId('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedYear = years.find((y) => String(y.id) === financialYearId) ?? null;
  const financialYearIdNum = financialYearId ? Number(financialYearId) : undefined;

  return {
    years,
    financialYearId,
    setFinancialYearId,
    financialYearIdNum,
    selectedYear,
    loading,
  };
}

export function ReportFinancialYearSelect({
  value,
  years,
  onChange,
  disabled,
}: {
  value: string;
  years: FinancialYear[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel>Financial year</FieldLabel>
      <SearchSelect
        value={value}
        onChange={onChange}
        disabled={disabled || years.length === 0}
        options={years.map((y) => ({
          value: String(y.id),
          label: financialYearOptionLabel(y),
        }))}
        placeholder="Select financial year…"
      />
    </div>
  );
}
