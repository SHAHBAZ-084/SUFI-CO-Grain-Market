import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FieldLabel,
  FinancialButton,
  PageShell,
  Panel,
  TextInput,
} from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { api, Account, AccountCategory, Product, SystemPreferences } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import {
  computeKachiMaalInvoiceTotals,
  computeKachiMaalRow,
  DEBIT_ACCOUNT_CATEGORIES,
  parseNum,
  PURCHASE_PARTY_CATEGORIES,
} from '../../lib/kachiMaalCalculations';

type BoriThelaMode = 'BORI' | 'THELA';

type GridRow = {
  clientId: string;
  partyAccountId: number;
  partyName: string;
  jins: string;
  qism: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
  totalWeightKg: number;
  ratePerMaund: number;
  amount: number;
  bardanaQty: number | null;
  bardanaRate: number | null;
  bardanaAmount: number | null;
  netCreditToParty: number;
  totalMazduriPreview: number;
};

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterCategories(all: AccountCategory[], allowed: readonly string[]) {
  const set = new Set(allowed);
  return all.filter((c) => set.has(c.name));
}

function flatAccountOptions(
  categories: AccountCategory[],
  accounts: Account[],
  categoryNames: readonly string[],
) {
  const allowedIds = new Set(filterCategories(categories, categoryNames).map((c) => c.id));
  return accounts
    .filter((a) => allowedIds.has(a.categoryId))
    .map((a) => ({ value: String(a.id), label: a.name }));
}

function FlatAccountSelect({
  label,
  categoryNames,
  categories,
  accounts,
  value,
  onChange,
  placeholder = 'Search account…',
}: {
  label: string;
  categoryNames: readonly string[];
  categories: AccountCategory[];
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const options = flatAccountOptions(categories, accounts, categoryNames);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <SearchSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
      />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-textMuted">{children}</p>
  );
}

function FormSection({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-t border-border pt-6 first:border-t-0 first:pt-0 ${className}`}>
      {label ? <SectionHeading>{label}</SectionHeading> : null}
      <div className={label ? 'mt-4' : undefined}>{children}</div>
    </div>
  );
}

/** Consistent field cell — prevents grid squeeze and label crowding. */
function Field({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}>{children}</div>;
}

function ReadOnlyAmount({ label, value }: { label: string; value: number }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="rounded-lg border border-border/60 bg-surface3/70 px-3 py-2 text-sm tabular-nums text-textSecondary">
        {formatLedgerAmount(value)}
      </div>
    </Field>
  );
}

export function KachiMaalInvoicePage() {
  const trapRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useFocusTrap(trapRef, { initialFocusRef: dateRef });

  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prefs, setPrefs] = useState<SystemPreferences | null>(null);
  const [predictedRef, setPredictedRef] = useState('');
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(todayInputValue);
  const [productId, setProductId] = useState('');
  const [jins, setJins] = useState('');
  const [qism, setQism] = useState('');
  const [billNo, setBillNo] = useState('');
  const [gariNo, setGariNo] = useState('');
  const [tafseel, setTafseel] = useState('');

  const [partyAccountId, setPartyAccountId] = useState('');
  const [boriThelaMode, setBoriThelaMode] = useState<BoriThelaMode>('BORI');
  const [bagCount, setBagCount] = useState('');
  const [bhartii, setBhartii] = useState('');
  const [dharanCount, setDharanCount] = useState('');
  const [looseKg, setLooseKg] = useState('');
  const [ratePerMaund, setRatePerMaund] = useState('');
  const [rowBardanaQty, setRowBardanaQty] = useState('');
  const [rowBardanaRate, setRowBardanaRate] = useState('');

  const [debitAccountId, setDebitAccountId] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [lowerBoriThela, setLowerBoriThela] = useState<BoriThelaMode>('BORI');
  const [lowerBardanaQty, setLowerBardanaQty] = useState('');
  const [lowerBardanaRate, setLowerBardanaRate] = useState('');

  const productOptions = useMemo(
    () => products.map((p) => ({ value: String(p.id), label: p.name })),
    [products],
  );

  const reload = useCallback(async () => {
    const refRow = await api.getNextKachiMaalReference();
    const [accountRows, categoryRows, prefRows, productRows] = await Promise.all([
      api.listAccounts(),
      api.listCategories(),
      api.getSystemPreferences(),
      api.listProducts(),
    ]);
    setAccounts(accountRows);
    setCategories(categoryRows);
    setPrefs(prefRows);
    setProducts(productRows);
    setPredictedRef(refRow.reference);
  }, []);

  useEffect(() => {
    reload().catch(() => setError('Failed to load accounts or preferences'));
  }, [reload]);

  const prefRates = prefs ?? {
    daamiPercent: 0,
    paleDariPercent: 0,
    brokeryPercent: 0,
    marketFeeRate: 0,
  };

  const entryPreview = useMemo(() => {
    const input = {
      bagCount: parseNum(bagCount),
      bhartii: parseNum(bhartii),
      dharanCount: parseNum(dharanCount),
      looseKg: parseNum(looseKg),
      ratePerMaund: parseNum(ratePerMaund),
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
    };
    return computeKachiMaalRow(input, prefRates);
  }, [bagCount, bhartii, dharanCount, looseKg, ratePerMaund, rowBardanaQty, rowBardanaRate, prefRates]);

  const invoiceTotals = useMemo(
    () =>
      computeKachiMaalInvoiceTotals(
        gridRows,
        prefRates,
        parseNum(miscAmount),
        lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
        lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
      ),
    [gridRows, prefRates, miscAmount, lowerBardanaQty, lowerBardanaRate],
  );

  function onProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => String(p.id) === id);
    setJins(product?.name ?? '');
  }

  function addRow() {
    setError('');
    if (!partyAccountId) {
      setError('Select a purchase party before adding a row');
      return;
    }
    const bh = parseNum(bhartii);
    const rate = parseNum(ratePerMaund);
    if (!(bh > 0)) {
      setError('Bhartii must be greater than zero');
      return;
    }
    if (!(rate > 0)) {
      setError('Rate must be greater than zero');
      return;
    }
    if (!(entryPreview.amount > 0)) {
      setError('Row amount must be greater than zero');
      return;
    }

    const party = accounts.find((a) => String(a.id) === partyAccountId);
    const row: GridRow = {
      clientId: `${Date.now()}-${Math.random()}`,
      partyAccountId: Number(partyAccountId),
      partyName: party?.name ?? '',
      jins: jins.trim(),
      qism: qism.trim(),
      boriOrThelaMode: boriThelaMode,
      bagCount: parseNum(bagCount),
      bhartii: bh,
      dharanCount: parseNum(dharanCount),
      looseKg: parseNum(looseKg),
      totalWeightKg: entryPreview.totalWeightKg,
      ratePerMaund: rate,
      amount: entryPreview.amount,
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
      bardanaAmount: entryPreview.bardanaAmount,
      netCreditToParty: entryPreview.netCreditToParty,
      totalMazduriPreview: entryPreview.totalMazduriPreview,
    };
    setGridRows((prev) => [...prev, row]);
    setBagCount('');
    setDharanCount('');
    setLooseKg('');
    setRatePerMaund('');
    setRowBardanaQty('');
    setRowBardanaRate('');
  }

  function removeRow(clientId: string) {
    setGridRows((prev) => prev.filter((r) => r.clientId !== clientId));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (gridRows.length === 0) {
      setError('Add at least one row to the grid');
      return;
    }
    if (!debitAccountId) {
      setError('Select the debit account for this invoice');
      return;
    }
    if (invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0 && !lowerBoriThela) {
      setError('Select Bori or Thela for lower-section bardana');
      return;
    }

    setSaving(true);
    try {
      const result = await api.createKachiMaalInvoice({
        invoiceDate,
        billNo: billNo.trim() || undefined,
        gariNo: gariNo.trim() || undefined,
        jins: jins.trim() || undefined,
        qism: qism.trim() || undefined,
        tafseel: tafseel.trim() || undefined,
        debitAccountId: Number(debitAccountId),
        miscAmount: parseNum(miscAmount),
        lowerBardanaMode:
          invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0
            ? lowerBoriThela
            : null,
        lowerBardanaQty: lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
        lowerBardanaRate: lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
        lines: gridRows.map((row) => ({
          partyAccountId: row.partyAccountId,
          jins: row.jins || undefined,
          qism: row.qism || undefined,
          boriOrThelaMode: row.boriOrThelaMode,
          bagCount: row.bagCount,
          bhartii: row.bhartii,
          dharanCount: row.dharanCount,
          looseKg: row.looseKg,
          ratePerMaund: row.ratePerMaund,
          bardanaQty: row.bardanaQty,
          bardanaRate: row.bardanaRate,
        })),
      });
      setMessage(`Invoice ${result.reference} posted with ${result.vouchers?.length ?? 0} vouchers.`);
      setGridRows([]);
      setMiscAmount('');
      setLowerBardanaQty('');
      setLowerBardanaRate('');
      const refRow = await api.getNextKachiMaalReference();
      setPredictedRef(refRow.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Kachi Maal" subtitle="Multi-party purchase / settlement">
      <Panel className="mx-auto w-full overflow-visible !p-6 sm:!p-8">
        <div ref={trapRef} className="overflow-visible">
          <form onSubmit={onSave} className="space-y-0">
            <FormSection>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Field>
                  <FieldLabel>Date</FieldLabel>
                  <TextInput
                    ref={dateRef}
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Invoice #</FieldLabel>
                  <div className="rounded-lg border border-border bg-surface2 px-3 py-2">
                    <span className="text-xl font-bold tabular-nums text-financial">
                      {predictedRef || '…'}
                    </span>
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Jins</FieldLabel>
                  <SearchSelect
                    value={productId}
                    onChange={onProductChange}
                    options={productOptions}
                    placeholder="Select product…"
                  />
                </Field>
                <Field>
                  <FieldLabel>Bill #</FieldLabel>
                  <TextInput value={billNo} onChange={(e) => setBillNo(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Gari #</FieldLabel>
                  <TextInput value={gariNo} onChange={(e) => setGariNo(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Tafseel</FieldLabel>
                  <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
                </Field>
              </div>
            </FormSection>

            {/* Add row — two rows with breathing room */}
            <FormSection label="Add dheri row">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:items-end">
                  <Field className="sm:col-span-2 xl:col-span-2">
                    <FlatAccountSelect
                      label="Party"
                      categoryNames={PURCHASE_PARTY_CATEGORIES}
                      categories={categories}
                      accounts={accounts}
                      value={partyAccountId}
                      onChange={setPartyAccountId}
                      placeholder="Search party…"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Bori / Thela</FieldLabel>
                    <SegmentedControl
                      value={boriThelaMode}
                      onChange={(v) => setBoriThelaMode(v as BoriThelaMode)}
                      options={[
                        { value: 'BORI', label: 'Bori' },
                        { value: 'THELA', label: 'Thela' },
                      ]}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{boriThelaMode === 'BORI' ? 'Bori count' : 'Thela count'}</FieldLabel>
                    <TextInput value={bagCount} onChange={(e) => setBagCount(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Dharan</FieldLabel>
                    <TextInput value={dharanCount} onChange={(e) => setDharanCount(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Kilo</FieldLabel>
                    <TextInput value={looseKg} onChange={(e) => setLooseKg(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Bhartii</FieldLabel>
                    <TextInput value={bhartii} onChange={(e) => setBhartii(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Rate / Maund</FieldLabel>
                    <TextInput value={ratePerMaund} onChange={(e) => setRatePerMaund(e.target.value)} inputMode="decimal" />
                  </Field>
                </div>
                <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <ReadOnlyAmount label="Amount" value={entryPreview.amount} />
                  </Field>
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <FieldLabel>Bardana qty</FieldLabel>
                    <TextInput value={rowBardanaQty} onChange={(e) => setRowBardanaQty(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <FieldLabel>Bardana rate</FieldLabel>
                    <TextInput value={rowBardanaRate} onChange={(e) => setRowBardanaRate(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <ReadOnlyAmount label="Net to party" value={entryPreview.netCreditToParty} />
                  </Field>
                  <div className="ml-auto shrink-0 pb-0.5">
                    <FinancialButton type="button" className="px-6 py-2.5" onClick={addRow}>
                      Add to grid
                    </FinancialButton>
                  </div>
                </div>
              </div>
            </FormSection>

            {gridRows.length > 0 ? (
              <FormSection label="Preview grid">
                <div className="max-h-40 overflow-auto rounded-lg border border-border/60">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-surface2">
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-textMuted">
                        <th className="px-3 py-2.5">Party</th>
                        <th className="px-3 py-2.5">Dheri</th>
                        <th className="px-3 py-2.5">Variety</th>
                        <th className="px-3 py-2.5 text-right">Weight</th>
                        <th className="px-3 py-2.5 text-right">Rate</th>
                        <th className="px-3 py-2.5 text-right">Amount</th>
                        <th className="px-3 py-2.5 text-right">Bardana</th>
                        <th className="px-3 py-2.5 text-right">Net</th>
                        <th className="px-3 py-2.5">Mode</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {gridRows.map((row) => (
                        <tr key={row.clientId} className="border-b border-border/40">
                          <td className="px-3 py-2">{row.partyName}</td>
                          <td className="px-3 py-2 tabular-nums">{row.bagCount}</td>
                          <td className="px-3 py-2">{row.qism || row.jins || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.totalWeightKg)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.ratePerMaund)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.amount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.bardanaAmount != null ? formatLedgerAmount(row.bardanaAmount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.netCreditToParty)}</td>
                          <td className="px-3 py-2">{row.boriOrThelaMode === 'BORI' ? 'Bori' : 'Thela'}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-xs text-danger hover:underline"
                              onClick={() => removeRow(row.clientId)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </FormSection>
            ) : null}

            {/* Settlement — debit + totals in structured rows */}
            <FormSection label="Settlement (debit side)">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-start">
                  <Field>
                    <FlatAccountSelect
                      label="Debit account"
                      categoryNames={DEBIT_ACCOUNT_CATEGORIES}
                      categories={categories}
                      accounts={accounts}
                      value={debitAccountId}
                      onChange={setDebitAccountId}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <ReadOnlyAmount label="Goods total" value={invoiceTotals.totalGoodsAmount} />
                    <ReadOnlyAmount label={`Pale Dari (${prefRates.paleDariPercent}%)`} value={invoiceTotals.totalPaleDari} />
                    <ReadOnlyAmount label={`Brokery (${prefRates.brokeryPercent}%)`} value={invoiceTotals.totalBrokery} />
                    <ReadOnlyAmount
                      label={`Market fee (${invoiceTotals.totalCalculatedBags.toFixed(2)} bags)`}
                      value={invoiceTotals.marketFeeAmount}
                    />
                    <ReadOnlyAmount label={`Daami (${prefRates.daamiPercent}%)`} value={invoiceTotals.profitAmount} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 xl:items-end">
                  <Field>
                    <FieldLabel>Misc (optional)</FieldLabel>
                    <TextInput value={miscAmount} onChange={(e) => setMiscAmount(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Lower bardana</FieldLabel>
                    <SegmentedControl
                      value={lowerBoriThela}
                      onChange={(v) => setLowerBoriThela(v as BoriThelaMode)}
                      options={[
                        { value: 'BORI', label: 'Bori' },
                        { value: 'THELA', label: 'Thela' },
                      ]}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Lower bardana qty</FieldLabel>
                    <TextInput value={lowerBardanaQty} onChange={(e) => setLowerBardanaQty(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Lower bardana rate</FieldLabel>
                    <TextInput value={lowerBardanaRate} onChange={(e) => setLowerBardanaRate(e.target.value)} inputMode="decimal" />
                  </Field>
                  {invoiceTotals.lowerBardanaAmount != null ? (
                    <ReadOnlyAmount label="Lower bardana amount" value={invoiceTotals.lowerBardanaAmount} />
                  ) : null}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
                <div className="flex items-baseline gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-textMuted">Total debit</span>
                  <span className="text-2xl font-bold tabular-nums text-financial">
                    {formatLedgerAmount(invoiceTotals.totalDebitAmount)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                  {message ? <p className="text-sm text-success">{message}</p> : null}
                  <FinancialButton type="submit" disabled={saving} className="px-6 py-2.5">
                    {saving ? 'Saving…' : 'Save invoice'}
                  </FinancialButton>
                </div>
              </div>
            </FormSection>
          </form>
        </div>
      </Panel>
    </PageShell>
  );
}
