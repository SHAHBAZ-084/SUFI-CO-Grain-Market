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
import { api, Account, AccountCategory, SystemPreferences } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import {
  InvoiceGridPlaceholderRows,
  InvoicePreviewGridShell,
} from './InvoicePreviewGrid';
import {
  computeSalePaunchInvoiceTotals,
  computeSalePaunchRow,
  MAAL_KHATA_CATEGORIES,
  parseNum,
  SALE_PARTY_CATEGORIES,
} from '../../lib/salePaunchCalculations';

type BoriThelaMode = 'BORI' | 'THELA';

type GridRow = {
  clientId: string;
  maalKhataAccountId: number;
  maalKhataName: string;
  boriOrThelaMode: BoriThelaMode;
  bagCount: number;
  bhartii: number;
  dharanCount: number;
  looseKg: number;
  kaatKg: number;
  totalWeightKg: number;
  netWeightKg: number;
  upperRatePerMaund: number;
  dammiChecked: boolean;
  bardanaQty: number | null;
  bardanaRate: number | null;
  maunds: number;
  upperAmount: number;
  kanta: number;
  netUpperAmount: number;
  dammiAmount: number;
  bardanaAmount: number | null;
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
      <SearchSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-textMuted">{children}</p>;
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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field>
      <label className="flex cursor-pointer items-center gap-2 pt-6">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border text-financial"
        />
        <span className="text-sm font-medium text-textPrimary">{label}</span>
      </label>
    </Field>
  );
}

export function SalePaunchInvoicePage() {
  const trapRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useFocusTrap(trapRef, { initialFocusRef: dateRef });

  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [prefs, setPrefs] = useState<SystemPreferences | null>(null);
  const [predictedRef, setPredictedRef] = useState('');
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(todayInputValue);
  const [billNo, setBillNo] = useState('');
  const [gariNo, setGariNo] = useState('');
  const [tafseel, setTafseel] = useState('');

  const [maalKhataAccountId, setMaalKhataAccountId] = useState('');
  const [boriThelaMode, setBoriThelaMode] = useState<BoriThelaMode>('BORI');
  const [bagCount, setBagCount] = useState('');
  const [dharanCount, setDharanCount] = useState('');
  const [looseKg, setLooseKg] = useState('');
  const [bhartii, setBhartii] = useState('');
  const [kaatKg, setKaatKg] = useState('');
  const [kanta, setKanta] = useState('');
  const [upperRatePerMaund, setUpperRatePerMaund] = useState('');
  const [rowBardanaQty, setRowBardanaQty] = useState('');
  const [rowBardanaRate, setRowBardanaRate] = useState('');
  const [dammiChecked, setDammiChecked] = useState(false);

  const [salePartyAccountId, setSalePartyAccountId] = useState('');
  const [lowerRatePerMaund, setLowerRatePerMaund] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [biltyKirayaAmount, setBiltyKirayaAmount] = useState('');
  const [lowerBoriThela, setLowerBoriThela] = useState<BoriThelaMode>('BORI');
  const [lowerBardanaQty, setLowerBardanaQty] = useState('');
  const [lowerBardanaRate, setLowerBardanaRate] = useState('');

  const reload = useCallback(async () => {
    const refRow = await api.getNextSalePaunchReference();
    const [accountRows, categoryRows, prefRows] = await Promise.all([
      api.listAccounts(),
      api.listCategories(),
      api.getSystemPreferences(),
    ]);
    setAccounts(accountRows);
    setCategories(categoryRows);
    setPrefs(prefRows);
    setPredictedRef(refRow.reference);
  }, []);

  useEffect(() => {
    reload().catch(() => setError('Failed to load accounts or preferences'));
  }, [reload]);

  const prefRates = prefs ?? {
    daamiPercent: 0,
  };

  const entryPreview = useMemo(() => {
    const input = {
      bagCount: parseNum(bagCount),
      bhartii: parseNum(bhartii),
      dharanCount: parseNum(dharanCount),
      looseKg: parseNum(looseKg),
      kaatKg: kaatKg.trim() ? parseNum(kaatKg) : 0,
      upperRatePerMaund: parseNum(upperRatePerMaund),
      kanta: kanta.trim() ? parseNum(kanta) : 0,
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
      dammiChecked,
    };
    return computeSalePaunchRow(input, prefRates);
  }, [
    bagCount,
    bhartii,
    dharanCount,
    looseKg,
    kaatKg,
    upperRatePerMaund,
    kanta,
    rowBardanaQty,
    rowBardanaRate,
    dammiChecked,
    prefRates,
  ]);

  const invoiceTotals = useMemo(
    () =>
      computeSalePaunchInvoiceTotals(gridRows, {
        lowerRatePerMaund: lowerRatePerMaund.trim() ? parseNum(lowerRatePerMaund) : 0,
        taxAmount: taxAmount.trim() ? parseNum(taxAmount) : 0,
        miscAmount: miscAmount.trim() ? parseNum(miscAmount) : 0,
        biltyKirayaAmount: biltyKirayaAmount.trim() ? parseNum(biltyKirayaAmount) : 0,
        lowerBardanaQty: lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
        lowerBardanaRate: lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
      }),
    [gridRows, lowerRatePerMaund, taxAmount, miscAmount, biltyKirayaAmount, lowerBardanaQty, lowerBardanaRate],
  );

  function addRow() {
    setError('');
    if (!maalKhataAccountId) {
      setError('Select a Maal Khata account before adding a row');
      return;
    }
    const bh = parseNum(bhartii);
    const upperRate = parseNum(upperRatePerMaund);
    if (!(bh > 0)) {
      setError('Bhartii must be greater than zero');
      return;
    }
    if (!(upperRate > 0)) {
      setError('Upper rate must be greater than zero');
      return;
    }
    const kaat = kaatKg.trim() ? parseNum(kaatKg) : 0;
    if (kaat > entryPreview.totalWeightKg) {
      setError('Kaat cannot exceed total weight');
      return;
    }
    if (!(entryPreview.netWeightKg > 0)) {
      setError('Net weight after kaat must be greater than zero');
      return;
    }
    if (!(entryPreview.netUpperAmount > 0)) {
      setError('Net upper amount must be greater than zero after kanta');
      return;
    }

    const maalKhata = accounts.find((a) => String(a.id) === maalKhataAccountId);
    const row: GridRow = {
      clientId: `${Date.now()}-${Math.random()}`,
      maalKhataAccountId: Number(maalKhataAccountId),
      maalKhataName: maalKhata?.name ?? '',
      boriOrThelaMode: boriThelaMode,
      bagCount: parseNum(bagCount),
      bhartii: bh,
      dharanCount: parseNum(dharanCount),
      looseKg: parseNum(looseKg),
      kaatKg: kaat,
      upperRatePerMaund: upperRate,
      dammiChecked,
      bardanaQty: rowBardanaQty.trim() ? parseNum(rowBardanaQty) : null,
      bardanaRate: rowBardanaRate.trim() ? parseNum(rowBardanaRate) : null,
      totalWeightKg: entryPreview.totalWeightKg,
      netWeightKg: entryPreview.netWeightKg,
      maunds: entryPreview.maunds,
      upperAmount: entryPreview.upperAmount,
      kanta: entryPreview.kanta,
      netUpperAmount: entryPreview.netUpperAmount,
      dammiAmount: entryPreview.dammiAmount,
      bardanaAmount: entryPreview.bardanaAmount,
    };
    setGridRows((prev) => [...prev, row]);
    setBagCount('');
    setDharanCount('');
    setLooseKg('');
    setKaatKg('');
    setKanta('');
    setUpperRatePerMaund('');
    setRowBardanaQty('');
    setRowBardanaRate('');
    setDammiChecked(false);
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
    if (!salePartyAccountId) {
      setError('Select a sale party for settlement');
      return;
    }
    const lowerRate = lowerRatePerMaund.trim() ? parseNum(lowerRatePerMaund) : 0;
    if (!(lowerRate > 0)) {
      setError('Lower rate must be greater than zero');
      return;
    }
    if (!(invoiceTotals.totalLowerAmount > 0)) {
      setError('Lower amount must be greater than zero');
      return;
    }
    if (invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0 && !lowerBoriThela) {
      setError('Select Bori or Thela for lower-section bardana');
      return;
    }

    setSaving(true);
    try {
      const result = await api.createSalePaunchInvoice({
        invoiceDate,
        salePartyAccountId: Number(salePartyAccountId),
        billNo: billNo.trim() || undefined,
        gariNo: gariNo.trim() || undefined,
        tafseel: tafseel.trim() || undefined,
        taxAmount: taxAmount.trim() ? parseNum(taxAmount) : undefined,
        miscAmount: miscAmount.trim() ? parseNum(miscAmount) : undefined,
        biltyKirayaAmount: biltyKirayaAmount.trim() ? parseNum(biltyKirayaAmount) : undefined,
        lowerBardanaMode:
          invoiceTotals.lowerBardanaAmount != null && invoiceTotals.lowerBardanaAmount > 0
            ? lowerBoriThela
            : null,
        lowerBardanaQty: lowerBardanaQty.trim() ? parseNum(lowerBardanaQty) : null,
        lowerBardanaRate: lowerBardanaRate.trim() ? parseNum(lowerBardanaRate) : null,
        lines: gridRows.map((row) => ({
          maalKhataAccountId: row.maalKhataAccountId,
          boriOrThelaMode: row.boriOrThelaMode,
          bagCount: row.bagCount,
          bhartii: row.bhartii,
          dharanCount: row.dharanCount,
          looseKg: row.looseKg,
          kaatKg: row.kaatKg,
          upperRatePerMaund: row.upperRatePerMaund,
          lowerRatePerMaund: lowerRate,
          kanta: row.kanta,
          bardanaQty: row.bardanaQty,
          bardanaRate: row.bardanaRate,
          dammiChecked: row.dammiChecked,
        })),
      });
      setMessage(`Invoice ${result.reference} posted.`);
      setGridRows([]);
      setSalePartyAccountId('');
      setTaxAmount('');
      setMiscAmount('');
      setBiltyKirayaAmount('');
      setLowerBardanaQty('');
      setLowerBardanaRate('');
      setLowerRatePerMaund('');
      const refRow = await api.getNextSalePaunchReference();
      setPredictedRef(refRow.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Sale on Paunch" subtitle="Multi–Maal Khata upper-side rows; lower rate and settlement on the debit side">
      <Panel className="mx-auto w-full overflow-visible !p-6 sm:!p-8">
        <div ref={trapRef} className="overflow-visible">
          <form onSubmit={onSave} className="space-y-0">
            <FormSection>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <Field>
                  <FieldLabel>Date</FieldLabel>
                  <TextInput ref={dateRef} type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Invoice #</FieldLabel>
                  <div className="rounded-lg border border-border bg-surface2 px-3 py-2">
                    <span className="text-xl font-bold tabular-nums text-financial">{predictedRef || '…'}</span>
                  </div>
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

            <FormSection label="Add dheri row">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9 xl:items-end">
                  <Field className="sm:col-span-2 xl:col-span-2">
                    <FlatAccountSelect
                      label="Maal Khata"
                      categoryNames={MAAL_KHATA_CATEGORIES}
                      categories={categories}
                      accounts={accounts}
                      value={maalKhataAccountId}
                      onChange={setMaalKhataAccountId}
                      placeholder="Search Maal Khata…"
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
                    <FieldLabel>Kaat (kg)</FieldLabel>
                    <TextInput value={kaatKg} onChange={(e) => setKaatKg(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Kanta</FieldLabel>
                    <TextInput value={kanta} onChange={(e) => setKanta(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Upper rate / Maund</FieldLabel>
                    <TextInput value={upperRatePerMaund} onChange={(e) => setUpperRatePerMaund(e.target.value)} inputMode="decimal" />
                  </Field>
                </div>
                <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <FieldLabel>Bardana qty</FieldLabel>
                    <TextInput value={rowBardanaQty} onChange={(e) => setRowBardanaQty(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <FieldLabel>Bardana rate</FieldLabel>
                    <TextInput value={rowBardanaRate} onChange={(e) => setRowBardanaRate(e.target.value)} inputMode="decimal" />
                  </Field>
                  <ToggleField
                    label={`Dammi (${prefRates.daamiPercent}%)`}
                    checked={dammiChecked}
                    onChange={setDammiChecked}
                  />
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <ReadOnlyAmount label="Net weight (kg)" value={entryPreview.netWeightKg} />
                  </Field>
                  <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                    <ReadOnlyAmount label="Upper net" value={entryPreview.netUpperAmount} />
                  </Field>
                  {dammiChecked ? (
                    <Field className="w-full min-w-[7rem] flex-1 sm:max-w-[10rem]">
                      <ReadOnlyAmount label="Dammi amount" value={entryPreview.dammiAmount} />
                    </Field>
                  ) : null}
                  <div className="ml-auto shrink-0 pb-0.5">
                    <FinancialButton type="button" className="px-6 py-2.5" onClick={addRow}>
                      Add to grid
                    </FinancialButton>
                  </div>
                </div>
              </div>
            </FormSection>

            <FormSection label="Preview grid">
              <InvoicePreviewGridShell>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface2">
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-textMuted">
                      <th className="px-3 py-2.5">Maal Khata</th>
                      <th className="px-3 py-2.5">Dheri</th>
                      <th className="px-3 py-2.5 text-right">Weight</th>
                      <th className="px-3 py-2.5 text-right">Kaat</th>
                      <th className="px-3 py-2.5 text-right">Net wt</th>
                      <th className="px-3 py-2.5 text-right">Upper rate</th>
                      <th className="px-3 py-2.5 text-right">Kanta</th>
                      <th className="px-3 py-2.5 text-right">Upper net</th>
                      <th className="px-3 py-2.5 text-right">Dammi</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row) => (
                      <tr key={row.clientId} className="border-b border-border/40">
                        <td className="px-3 py-2">{row.maalKhataName}</td>
                        <td className="px-3 py-2 tabular-nums">{row.bagCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.totalWeightKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.kaatKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.netWeightKg.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.upperRatePerMaund)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.kanta)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatLedgerAmount(row.netUpperAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.dammiChecked ? formatLedgerAmount(row.dammiAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-xs text-danger hover:underline" onClick={() => removeRow(row.clientId)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    <InvoiceGridPlaceholderRows columnCount={10} dataRowCount={gridRows.length} />
                  </tbody>
                </table>
              </InvoicePreviewGridShell>
            </FormSection>

            <FormSection label="Settlement (Sale Party debit)">
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(220px,320px)_1fr] lg:items-start">
                  <Field>
                    <FlatAccountSelect
                      label="Sale Party"
                      categoryNames={SALE_PARTY_CATEGORIES}
                      categories={categories}
                      accounts={accounts}
                      value={salePartyAccountId}
                      onChange={setSalePartyAccountId}
                      placeholder="Search sale party…"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <ReadOnlyAmount label="Net upper total" value={invoiceTotals.totalNetUpperAmount} />
                    <ReadOnlyAmount label="Dammi total" value={invoiceTotals.totalDammiAmount} />
                    {invoiceTotals.totalKaatKg > 0 ? (
                      <ReadOnlyAmount label="Total kaat (kg)" value={invoiceTotals.totalKaatKg} />
                    ) : null}
                    {invoiceTotals.paunchRevenueDifference !== 0 ? (
                      <ReadOnlyAmount label="Paunch revenue" value={invoiceTotals.paunchRevenueDifference} />
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9 xl:items-end">
                  <Field>
                    <FieldLabel>Lower rate / Maund</FieldLabel>
                    <TextInput value={lowerRatePerMaund} onChange={(e) => setLowerRatePerMaund(e.target.value)} inputMode="decimal" />
                  </Field>
                  <ReadOnlyAmount label="Lower amount" value={invoiceTotals.totalLowerAmount} />
                  <ReadOnlyAmount label="Row revenue" value={invoiceTotals.totalRowRevenue} />
                  <Field>
                    <FieldLabel>Tax</FieldLabel>
                    <TextInput value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Misc</FieldLabel>
                    <TextInput value={miscAmount} onChange={(e) => setMiscAmount(e.target.value)} inputMode="decimal" />
                  </Field>
                  <Field>
                    <FieldLabel>Bilty Kiraya</FieldLabel>
                    <TextInput value={biltyKirayaAmount} onChange={(e) => setBiltyKirayaAmount(e.target.value)} inputMode="decimal" />
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-textMuted">Sale Party total debit</span>
                  <span className="text-2xl font-bold tabular-nums text-financial">
                    {formatLedgerAmount(invoiceTotals.lowerNetTotal)}
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
