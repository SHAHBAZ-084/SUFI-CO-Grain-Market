import { ReportFinancialYearSelect } from '../../components/reports/ReportFinancialYearSelect';
import { useReportFinancialYear } from '../../contexts/ReportFinancialYearContext';
import { REPORT_QUICK_LINKS } from '../../config/navigation';
import { defaultCardDescription, QuickLinkCard } from '../../components/ui/QuickLinkCard';
import { PageShell, Panel } from '../../components/ui/PageShell';

/** Reports landing — sole place to pick Financial Year for FY-scoped reports. */
export function ReportsHubPage() {
  const { years, financialYearId, setFinancialYearId, selectedYear, loading } =
    useReportFinancialYear();

  return (
    <PageShell title="Reports" subtitle="Choose a financial year, then open a report">
      <Panel className="mb-6 max-w-md overflow-visible">
        <ReportFinancialYearSelect
          value={financialYearId}
          years={years}
          onChange={setFinancialYearId}
          disabled={loading}
        />
        {selectedYear ? (
          <p className="mt-2 text-xs text-textMuted">
            Account Ledger, Account Balance, Vouchers, and Trial Balance use this year.
            Daily, Sale/Purchase, and Stock reports use their own date filters.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_QUICK_LINKS.map((link) => (
          <QuickLinkCard
            key={link.to}
            to={link.to}
            title={link.label}
            description={link.description ?? defaultCardDescription(link.to)}
          />
        ))}
      </div>
    </PageShell>
  );
}
