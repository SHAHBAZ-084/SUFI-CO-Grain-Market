import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import { PageShell, Panel } from '../../components/ui/PageShell';

const ROUTE_TO_TYPE: Record<string, string> = {
  'sale-commission': 'SALE_COMMISSION',
  'sale-paunch': 'SALE_PAUNCH',
  'purchase-maal': 'PURCHASE_MAAL',
  'kachi-maal': 'KACHI_MAAL',
};

export function InvoiceFormPage({ slug }: { slug: string }) {
  const typeKey = ROUTE_TO_TYPE[slug];
  const title = INVOICE_TYPE_LABELS[typeKey] ?? 'Invoice';

  return (
    <PageShell
      title={title}
      subtitle="Form shell ready — posting will use createVoucherInTx() with balanced debit + credit in one transaction"
    >
      <Panel>
        <p className="text-sm leading-6 text-stone-600">
          This is the dedicated form for <strong>{title}</strong>. Field layout and grain-specific
          calculations will be added when you provide the business rules for this invoice type.
        </p>
        <p className="mt-3 rounded-lg bg-grain-50 px-3 py-2 text-sm text-grain-800">
          Golden rule: every money movement posts as a matched debit + credit pair via{' '}
          <code className="text-xs">createVoucherInTx()</code> — never a one-sided entry.
        </p>
      </Panel>
    </PageShell>
  );
}
