import { useNavigate } from 'react-router-dom';
import {
  InvoiceFieldStack,
  InvoiceFormSection,
} from '../../components/invoices/InvoiceFormLayout';
import { FormActionFooter } from '../../components/ui/FormActionFooter';
import { PageShell, Panel } from '../../components/ui/PageShell';
import { InvoicePreviewGridShell } from './InvoicePreviewGrid';

export function SaleCommissionInvoicePage() {
  const navigate = useNavigate();

  return (
    <PageShell centerTitle invoiceTitleBand title="Sale on Commission">
      <Panel className="inv-form-panel mx-auto w-full overflow-visible">
        <InvoiceFormSection>
          <p className="text-sm text-textMuted">
            Header fields (date, invoice #, bill, gari, tafseel) will be added when commission sale
            rules are defined.
          </p>
        </InvoiceFormSection>

        <InvoiceFormSection label="Add dheri row">
          <InvoiceFieldStack>
            <p className="text-sm text-textMuted">
              Dheri entry fields and calculations will be wired here.
            </p>
          </InvoiceFieldStack>
        </InvoiceFormSection>

        <InvoiceFormSection label="Preview grid">
          <InvoicePreviewGridShell isEmpty />
        </InvoiceFormSection>

        <InvoiceFormSection label="Settlement">
          <p className="text-sm text-textMuted">
            Settlement totals and posting will be added with the business rules for this invoice type.
          </p>
          <FormActionFooter
            primaryLabel="Save invoice"
            primaryType="button"
            onClose={() => navigate('/')}
          />
        </InvoiceFormSection>
      </Panel>
    </PageShell>
  );
}
