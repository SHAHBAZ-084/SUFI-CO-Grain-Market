import { formatDate, formatLedgerAmount, formatVoucherNumber, formatVoucherTypeLabel } from '../../lib/format';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import type { InvoiceDetail } from '../../lib/api';

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/50 py-2 text-sm">
      <span className="text-textSecondary">{label}</span>
      <span className="font-medium text-textPrimary">{value || '—'}</span>
    </div>
  );
}

function BillSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-textMuted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MaalHeader({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
      <FieldRow label="Date" value={invoice.invoiceDate ? formatDate(invoice.invoiceDate) : formatDate(invoice.createdAt)} />
      <FieldRow label="Invoice #" value={invoice.reference} />
      <FieldRow label="Jins" value={invoice.jins ?? ''} />
      <FieldRow label="Qism" value={invoice.qism ?? ''} />
      <FieldRow label="Bill #" value={invoice.billNo ?? ''} />
      <FieldRow label="Gari #" value={invoice.gariNo ?? ''} />
      <FieldRow label="Tafseel" value={invoice.tafseel ?? invoice.notes ?? ''} />
      <FieldRow label="Status" value={invoice.status} />
    </div>
  );
}

function KachiMaalBill({ invoice }: { invoice: InvoiceDetail }) {
  const lines = invoice.kachiMaalLines ?? [];
  const goodsTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
  const bardanaTotal = lines.reduce((s, l) => s + Number(l.bardanaAmount ?? 0), 0);
  const netTotal = lines.reduce((s, l) => s + Number(l.netCreditToParty), 0);

  return (
    <>
      <MaalHeader invoice={invoice} />
      <BillSection title="Party grid">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-textMuted">
              <th className="py-2 pr-2">Party</th>
              <th className="py-2 pr-2 text-right">Weight</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 pr-2 text-right">Amount</th>
              <th className="py-2 pr-2 text-right">Bardana</th>
              <th className="py-2 text-right">Net to party</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/40">
                <td className="py-2 pr-2">{line.partyAccount?.name ?? '—'}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.totalWeightKg)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.ratePerMaund)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.amount)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {line.bardanaAmount != null ? formatLedgerAmount(line.bardanaAmount) : '—'}
                </td>
                <td className="py-2 text-right tabular-nums">{formatLedgerAmount(line.netCreditToParty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BillSection>
      <BillSection title="Settlement">
        <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
          <FieldRow label="Debit account" value={invoice.debitAccount?.name ?? '—'} />
          <FieldRow label="Goods total" value={formatLedgerAmount(goodsTotal)} />
          <FieldRow label="Bardana (rows)" value={formatLedgerAmount(bardanaTotal)} />
          <FieldRow label="Misc" value={formatLedgerAmount(invoice.miscAmount ?? 0)} />
          <FieldRow
            label="Lower bardana"
            value={
              invoice.lowerBardanaAmount != null
                ? formatLedgerAmount(invoice.lowerBardanaAmount)
                : '—'
            }
          />
          <FieldRow label="Net to parties" value={formatLedgerAmount(netTotal)} />
          <FieldRow label="Total debit" value={formatLedgerAmount(invoice.total)} />
        </div>
      </BillSection>
    </>
  );
}

function PurchaseMaalBill({ invoice }: { invoice: InvoiceDetail }) {
  const lines = invoice.purchaseMaalLines ?? [];
  const goodsTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
  const dammiTotal = lines.reduce((s, l) => s + Number(l.dammiAmount ?? 0), 0);
  const bardanaTotal = lines.reduce((s, l) => s + Number(l.bardanaAmount ?? 0), 0);
  const netTotal = lines.reduce((s, l) => s + Number(l.netCreditToParty), 0);

  return (
    <>
      <MaalHeader invoice={invoice} />
      <BillSection title="Party grid">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-textMuted">
              <th className="py-2 pr-2">Party</th>
              <th className="py-2 pr-2 text-right">Weight</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 pr-2 text-right">Amount</th>
              <th className="py-2 pr-2 text-right">Bardana</th>
              <th className="py-2 pr-2 text-right">Dammi</th>
              <th className="py-2 text-right">Net to party</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/40">
                <td className="py-2 pr-2">{line.partyAccount?.name ?? '—'}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.totalWeightKg)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.ratePerMaund)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(line.amount)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {line.bardanaAmount != null ? formatLedgerAmount(line.bardanaAmount) : '—'}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {line.dammiChecked && line.dammiAmount != null
                    ? formatLedgerAmount(line.dammiAmount)
                    : '—'}
                </td>
                <td className="py-2 text-right tabular-nums">{formatLedgerAmount(line.netCreditToParty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BillSection>
      <BillSection title="Settlement">
        <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
          <FieldRow label="Debit account" value={invoice.debitAccount?.name ?? '—'} />
          <FieldRow label="Goods total" value={formatLedgerAmount(goodsTotal)} />
          <FieldRow label="Dammi total" value={formatLedgerAmount(dammiTotal)} />
          <FieldRow label="Market fee" value={invoice.marketFeeEnabled ? 'Applied' : 'Off'} />
          <FieldRow label="Mazduri" value={invoice.mazduriEnabled ? 'Applied' : 'Off'} />
          <FieldRow label="Bardana (rows)" value={formatLedgerAmount(bardanaTotal)} />
          <FieldRow
            label="Lower bardana"
            value={
              invoice.lowerBardanaAmount != null
                ? formatLedgerAmount(invoice.lowerBardanaAmount)
                : '—'
            }
          />
          <FieldRow label="Net to parties" value={formatLedgerAmount(netTotal)} />
          <FieldRow label="Buyer total debit" value={formatLedgerAmount(invoice.total)} />
        </div>
      </BillSection>
    </>
  );
}

function SaleBill({ invoice }: { invoice: InvoiceDetail }) {
  const items = invoice.items ?? [];
  return (
    <>
      <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
        <FieldRow label="Invoice #" value={invoice.reference} />
        <FieldRow label="Date" value={formatDate(invoice.createdAt)} />
        <FieldRow label="Status" value={invoice.status} />
        <FieldRow label="Customer" value={invoice.customer?.name ?? '—'} />
        <FieldRow label="Supplier" value={invoice.supplier?.name ?? '—'} />
        <FieldRow label="Notes" value={invoice.notes ?? ''} />
      </div>
      <BillSection title="Line items">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-textMuted">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Unit price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/40">
                <td className="py-2 pr-2">{item.label}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(item.quantity)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(item.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{formatLedgerAmount(item.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="py-2" colSpan={3}>Invoice total</td>
              <td className="py-2 text-right tabular-nums">{formatLedgerAmount(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </BillSection>
    </>
  );
}

function VoucherAudit({ invoice }: { invoice: InvoiceDetail }) {
  const links = invoice.vouchers ?? [];
  if (links.length === 0) return null;

  return (
    <BillSection title="Linked vouchers">
      {links.map(({ voucher }) => {
        const legs = voucher.ledgerEntries ?? [];
        const isMultiLeg = voucher.type === 'KACHI' || voucher.type === 'PURCHASE_MAAL';

        return (
          <div key={voucher.id} className="mb-4 rounded-lg border border-border/60 p-4 last:mb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums">
                #{formatVoucherNumber(voucher.number, voucher.type)}
              </span>
              <span className="text-textSecondary">{formatVoucherTypeLabel(voucher.type)}</span>
              <span className="text-textMuted">· {formatLedgerAmount(voucher.amount)}</span>
              <span className="text-textMuted">· {voucher.status}</span>
            </div>
            {isMultiLeg && legs.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-textMuted">
                    <th className="py-1 pr-2">Account</th>
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((leg) => (
                    <tr key={leg.id} className="border-b border-border/30">
                      <td className="py-1 pr-2">{leg.ledger?.account?.name ?? '—'}</td>
                      <td className="py-1 pr-2">{leg.type === 'DEBIT' ? 'Debit' : 'Credit'}</td>
                      <td className="py-1 text-right tabular-nums">{formatLedgerAmount(leg.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs text-textSecondary">
                <span>From: {voucher.creditAccount?.name ?? '—'}</span>
                <span>To: {voucher.debitAccount?.name ?? '—'}</span>
              </div>
            )}
          </div>
        );
      })}
    </BillSection>
  );
}

export function InvoiceBillView({ invoice }: { invoice: InvoiceDetail }) {
  const typeLabel = INVOICE_TYPE_LABELS[invoice.type] ?? invoice.type;

  return (
    <div className="bg-white p-8 text-textPrimary">
      <header className="border-b-2 border-financial pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-textMuted">Sufi Co Grain Market</p>
        <h1 className="mt-1 text-2xl font-bold text-financial">{typeLabel}</h1>
        <p className="mt-1 text-sm text-textSecondary">{invoice.reference}</p>
      </header>

      {invoice.type === 'KACHI_MAAL' ? <KachiMaalBill invoice={invoice} /> : null}
      {invoice.type === 'PURCHASE_MAAL' ? <PurchaseMaalBill invoice={invoice} /> : null}
      {invoice.type === 'SALE_COMMISSION' || invoice.type === 'SALE_PAUNCH' ? (
        <SaleBill invoice={invoice} />
      ) : null}

      <VoucherAudit invoice={invoice} />

      {invoice.createdBy ? (
        <p className="mt-8 border-t border-border pt-4 text-xs text-textMuted">
          Posted by {invoice.createdBy.displayName || invoice.createdBy.username}
        </p>
      ) : null}
    </div>
  );
}
