import { useEffect, useState } from 'react';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import { api, type Invoice } from '../../lib/api';
import { PageShell, Panel } from '../../components/ui/PageShell';

export function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    api.listInvoices().then(setInvoices).catch(() => setInvoices([]));
  }, []);

  return (
    <PageShell title="View Previous Bill" subtitle="All invoice types in one history list">
      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
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
              <tr key={inv.id} className="border-b border-stone-100">
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
          <p className="py-6 text-center text-sm text-stone-500">No invoices yet.</p>
        ) : null}
      </Panel>
    </PageShell>
  );
}
