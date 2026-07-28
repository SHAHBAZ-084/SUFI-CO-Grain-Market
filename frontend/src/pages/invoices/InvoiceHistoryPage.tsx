import { useEffect, useState } from 'react';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import { api, type Invoice } from '../../lib/api';
import { PageShell, Panel, PrimaryButton } from '../../components/ui/PageShell';

const PAGE_SIZE = 100;

export function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listInvoices(undefined, { limit: PAGE_SIZE, offset })
      .then((page) => {
        setInvoices(page.items);
        setTotal(page.total);
      })
      .catch(() => {
        setInvoices([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [offset]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + invoices.length, total);

  return (
    <PageShell title="View Previous Bill" subtitle="All invoice types in one history list">
      <Panel>
        {loading ? (
          <p className="py-6 text-center text-sm text-textMuted">Loading…</p>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-textSecondary">
                  <th className="py-2">Reference</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Party</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border">
                    <td className="py-2 font-medium">{inv.reference}</td>
                    <td className="py-2">{INVOICE_TYPE_LABELS[inv.type] ?? inv.type}</td>
                    <td className="py-2">{inv.customer?.name ?? inv.supplier?.name ?? '—'}</td>
                    <td className="py-2">{Number(inv.total).toFixed(2)}</td>
                    <td className="py-2">{inv.status}</td>
                    <td className="py-2">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === 0 ? (
              <p className="py-6 text-center text-sm text-textMuted">No invoices yet.</p>
            ) : null}
            {total > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-textSecondary">
                  Showing {pageStart}–{pageEnd} of {total}
                </p>
                <div className="flex gap-2">
                  <PrimaryButton
                    type="button"
                    disabled={offset === 0}
                    onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                  >
                    Previous
                  </PrimaryButton>
                  <PrimaryButton
                    type="button"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                  >
                    Next
                  </PrimaryButton>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </PageShell>
  );
}
