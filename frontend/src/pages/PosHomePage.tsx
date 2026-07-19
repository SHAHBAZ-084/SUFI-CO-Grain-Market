import { Link } from 'react-router-dom';
import { TOP_NAV } from '../config/navigation';
import { PageShell, Panel } from '../components/ui/PageShell';

export function PosHomePage() {
  const invoiceLinks = TOP_NAV.find((g) => g.label === 'Sale/Purchase Invoice')?.children ?? [];

  return (
    <PageShell
      title="Sale / Purchase Invoice"
      subtitle="Select an invoice type to begin. All money entries post as balanced debit + credit pairs."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {invoiceLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="group rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-grain-400 hover:shadow-md"
          >
            <h2 className="text-lg font-medium text-stone-900 group-hover:text-grain-700">{link.label}</h2>
            <p className="mt-2 text-sm text-stone-500">
              {link.to === '/invoices/history'
                ? 'All invoice types in one history list'
                : 'Open invoice form'}
            </p>
          </Link>
        ))}
      </div>

      <Panel className="mt-6">
        <p className="text-sm leading-6 text-stone-600">
          Use the top bar to manage accounts, vouchers, inventory (Bardana), and reports. Sale Party and
          Purchase Party are customer/supplier ledgers from the accounting engine.
        </p>
      </Panel>
    </PageShell>
  );
}
