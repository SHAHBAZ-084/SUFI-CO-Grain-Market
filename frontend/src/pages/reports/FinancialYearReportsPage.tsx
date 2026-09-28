import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReportFinancialYear } from '../../contexts/ReportFinancialYearContext';
import { financialYearOptionLabel } from '../../components/reports/ReportFinancialYearSelect';
import { Modal } from '../../components/ui/Modal';
import { SearchSelect } from '../../components/ui/SearchSelect';
import {
  FieldLabel,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/PageShell';

/** Reports that read ReportFinancialYearContext. */
const CLOSED_YEAR_REPORT_LINKS: Array<{ label: string; to: string; note?: string }> = [
  { label: 'Daily Report', to: '/reports/daily' },
  { label: 'Account Ledger', to: '/reports/accounts' },
  { label: 'Account Balance', to: '/reports/account-balance' },
  { label: 'Vouchers', to: '/reports/vouchers' },
  { label: 'Detail Trial Balance', to: '/reports/trial-balance' },
  { label: 'Sale/Purchase Reports', to: '/reports/sale-purchase' },
  {
    label: 'Stock Report',
    to: '/reports/stock',
  },
];

/**
 * Hub for browsing closed financial years across reports.
 * Sets the shared ReportFinancialYearContext before navigating so destination
 * report filters are already on the chosen closed year.
 */
export function FinancialYearReportsPage() {
  const navigate = useNavigate();
  const { years, loading, setFinancialYearId, selectedYear } = useReportFinancialYear();

  const closedYears = useMemo(
    () => years.filter((y) => y.status === 'CLOSED'),
    [years],
  );

  const [pickerOpen, setPickerOpen] = useState(true);
  const [draftYearId, setDraftYearId] = useState('');
  const [hubYearId, setHubYearId] = useState('');

  const hubYear =
    closedYears.find((y) => String(y.id) === hubYearId)
    ?? (selectedYear?.status === 'CLOSED' ? selectedYear : null);

  function openPicker() {
    setDraftYearId(hubYearId || (hubYear ? String(hubYear.id) : ''));
    setPickerOpen(true);
  }

  function confirmYear() {
    if (!draftYearId) return;
    const match = closedYears.find((y) => String(y.id) === draftYearId);
    if (!match) return;
    setFinancialYearId(draftYearId);
    setHubYearId(draftYearId);
    setPickerOpen(false);
  }

  function openReport(to: string) {
    const id = hubYearId || (hubYear ? String(hubYear.id) : '');
    if (!id) {
      openPicker();
      return;
    }
    setFinancialYearId(id);
    navigate(to);
  }

  return (
    <PageShell
      title="Financial Year"
      subtitle="Browse reports for a closed financial year — pick a year once, then open any report with that year already selected"
    >
      <Modal
        open={pickerOpen}
        title="Select closed financial year"
        onClose={() => {
          if (hubYearId || hubYear) setPickerOpen(false);
        }}
        footer={
          <>
            {(hubYearId || hubYear) ? (
              <SecondaryButton type="button" onClick={() => setPickerOpen(false)}>
                Cancel
              </SecondaryButton>
            ) : null}
            <PrimaryButton type="button" onClick={confirmYear} disabled={!draftYearId || loading}>
              Continue
            </PrimaryButton>
          </>
        }
      >
        <div className="report-filter-stack">
          {loading ? (
            <p className="text-sm text-textSecondary">Loading financial years…</p>
          ) : closedYears.length === 0 ? (
            <p className="text-sm text-textSecondary">
              No closed financial years yet. Close the active year under System → Financial Year
              when the year ends; until then, use each report&apos;s own filters for the active year.
            </p>
          ) : (
            <div>
              <FieldLabel>Closed year</FieldLabel>
              <SearchSelect
                value={draftYearId}
                onChange={setDraftYearId}
                options={closedYears.map((y) => ({
                  value: String(y.id),
                  label: financialYearOptionLabel(y),
                }))}
                placeholder="Search closed year…"
              />
            </div>
          )}
        </div>
      </Modal>

      <Panel>
        {!hubYear && !pickerOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Select a closed financial year to continue.</p>
            <SecondaryButton type="button" onClick={openPicker}>
              Select year
            </SecondaryButton>
          </div>
        ) : hubYear ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-textMuted">Viewing</p>
                <h2 className="mt-1 text-xl font-semibold text-textPrimary">
                  {hubYear.label} (Closed)
                </h2>
                <p className="mt-1 text-sm text-textSecondary">
                  Open a report below — its Financial Year filter will already be set to this year.
                </p>
              </div>
              <SecondaryButton type="button" onClick={openPicker}>
                Change financial year
              </SecondaryButton>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CLOSED_YEAR_REPORT_LINKS.map((link) => (
                <button
                  key={link.to}
                  type="button"
                  onClick={() => openReport(link.to)}
                  className="rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:border-financial hover:bg-surface2"
                >
                  <span className="block font-medium text-textPrimary">{link.label}</span>
                  {link.note ? (
                    <span className="mt-1 block text-xs text-textMuted">{link.note}</span>
                  ) : (
                    <span className="mt-1 block text-xs text-financial">Opens with FY {hubYear.label}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </PageShell>
  );
}
