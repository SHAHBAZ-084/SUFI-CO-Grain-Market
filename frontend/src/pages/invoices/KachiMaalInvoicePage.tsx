import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FieldLabel,
  FinancialButton,
  PageShell,
  Panel,
  TextInput,
  Tile,
} from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { api, Account, AccountCategory, SystemPreferences } from '../../lib/api';
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

function AccountPicker({
  label,
  categoryNames,
  categories,
  accounts,
  categoryId,
  accountId,
  onCategoryChange,
  onAccountChange,
  categoryInputRef,
  accountInputRef,
  accountNextFocusRef,
  categoryTabIndex,
  accountTabIndex,
}: {
  label: string;
  categoryNames: readonly string[];
  categories: AccountCategory[];
  accounts: Account[];
  categoryId: string;
  accountId: string;
  onCategoryChange: (id: string) => void;
  onAccountChange: (id: string) => void;
  categoryInputRef?: React.RefObject<HTMLInputElement | null>;
  accountInputRef?: React.RefObject<HTMLInputElement | null>;
  accountNextFocusRef?: React.RefObject<HTMLElement | null>;
  categoryTabIndex?: number;
  accountTabIndex?: number;
}) {
  const filteredCategories = filterCategories(categories, categoryNames);
  const filteredAccounts = accounts.filter(
    (a) => categoryId && String(a.categoryId) === categoryId,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-textSecondary">{label}</p>
      <div>
        <FieldLabel>Category</FieldLabel>
        <SearchSelect
          inputRef={categoryInputRef}
          tabIndex={categoryTabIndex}
          value={categoryId}
          onChange={onCategoryChange}
          options={filteredCategories.map((c) => ({ value: String(c.id), label: c.name }))}
          placeholder="Search category…"
          nextFocusRef={accountInputRef}
          onSelected={() => requestAnimationFrame(() => accountInputRef?.current?.focus())}
        />
      </div>
      <div>
        <FieldLabel>Account</FieldLabel>
        <SearchSelect
          inputRef={accountInputRef}
          tabIndex={accountTabIndex}
          value={accountId}
          onChange={onAccountChange}
          options={filteredAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
          placeholder={categoryId ? 'Search account…' : 'Select category first'}
          disabled={!categoryId}
          nextFocusRef={accountNextFocusRef}
        />
      </div>
    </div>
  );
}

function ReadOnlyAmount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="rounded-lg border border-border bg-surface3 px-3 py-2 text-sm tabular-nums text-textPrimary">
        {formatLedgerAmount(value)}
      </div>
    </div>
  );
}

export function KachiMaalInvoicePage() {
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
  const [jins, setJins] = useState('');
  const [qism, setQism] = useState('');
  const [billNo, setBillNo] = useState('');
  const [gariNo, setGariNo] = useState('');
  const [tafseel, setTafseel] = useState('');

  const [partyCategoryId, setPartyCategoryId] = useState('');
  const [partyAccountId, setPartyAccountId] = useState('');
  const [boriThelaMode, setBoriThelaMode] = useState<BoriThelaMode>('BORI');
  const [bagCount, setBagCount] = useState('');
  const [bhartii, setBhartii] = useState('');
  const [dharanCount, setDharanCount] = useState('');
  const [looseKg, setLooseKg] = useState('');
  const [ratePerMaund, setRatePerMaund] = useState('');
  const [rowBardanaQty, setRowBardanaQty] = useState('');
  const [rowBardanaRate, setRowBardanaRate] = useState('');

  const [debitCategoryId, setDebitCategoryId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [lowerBoriThela, setLowerBoriThela] = useState<BoriThelaMode>('BORI');
  const [lowerBardanaQty, setLowerBardanaQty] = useState('');
  const [lowerBardanaRate, setLowerBardanaRate] = useState('');

  const reload = useCallback(async () => {
    const refRow = await api.getNextKachiMaalReference();
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
      <div ref={trapRef}>
        <form className="space-y-6" onSubmit={onSave}>
          <Panel className="overflow-visible">
            <Tile className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <FieldLabel>Date</FieldLabel>
                <TextInput
                  ref={dateRef}
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 block text-sm font-medium text-textSecondary">Invoice #</p>
                <div className="rounded-lg border border-border bg-surface2 px-3 py-2">
                  <span className="text-2xl font-bold tabular-nums text-financial">
                    {predictedRef || '…'}
                  </span>
                </div>
              </div>
              <div>
                <FieldLabel>Jins</FieldLabel>
                <TextInput value={jins} onChange={(e) => setJins(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Qism</FieldLabel>
                <TextInput value={qism} onChange={(e) => setQism(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Bill #</FieldLabel>
                <TextInput value={billNo} onChange={(e) => setBillNo(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Gari #</FieldLabel>
                <TextInput value={gariNo} onChange={(e) => setGariNo(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Tafseel</FieldLabel>
                <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
              </div>
            </Tile>
          </Panel>

          <Panel className="overflow-visible">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-textSecondary">
              Add dheri row
            </h2>
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <AccountPicker
                  label="Purchase party"
                  categoryNames={PURCHASE_PARTY_CATEGORIES}
                  categories={categories}
                  accounts={accounts}
                  categoryId={partyCategoryId}
                  accountId={partyAccountId}
                  onCategoryChange={(id) => {
                    setPartyCategoryId(id);
                    setPartyAccountId('');
                  }}
                  onAccountChange={setPartyAccountId}
                />
              </div>
              <div className="space-y-3 lg:col-span-9">
                <div>
                  <FieldLabel>Bori / Thela</FieldLabel>
                  <SegmentedControl
                    value={boriThelaMode}
                    onChange={(v) => setBoriThelaMode(v as BoriThelaMode)}
                    options={[
                      { value: 'BORI', label: 'Bori' },
                      { value: 'THELA', label: 'Thela' },
                    ]}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <FieldLabel>{boriThelaMode === 'BORI' ? 'Bori count' : 'Thela count'}</FieldLabel>
                    <TextInput value={bagCount} onChange={(e) => setBagCount(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Bhartii</FieldLabel>
                    <TextInput value={bhartii} onChange={(e) => setBhartii(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Dharan</FieldLabel>
                    <TextInput value={dharanCount} onChange={(e) => setDharanCount(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Kilo</FieldLabel>
                    <TextInput value={looseKg} onChange={(e) => setLooseKg(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Rate / Maund</FieldLabel>
                    <TextInput value={ratePerMaund} onChange={(e) => setRatePerMaund(e.target.value)} inputMode="decimal" />
                  </div>
                  <ReadOnlyAmount label="Amount" value={entryPreview.amount} />
                  <div>
                    <FieldLabel>Bardana qty (optional)</FieldLabel>
                    <TextInput value={rowBardanaQty} onChange={(e) => setRowBardanaQty(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Bardana rate (optional)</FieldLabel>
                    <TextInput value={rowBardanaRate} onChange={(e) => setRowBardanaRate(e.target.value)} inputMode="decimal" />
                  </div>
                  <ReadOnlyAmount label="Net to party" value={entryPreview.netCreditToParty} />
                  <ReadOnlyAmount label="Total Mazduri (preview)" value={entryPreview.totalMazduriPreview} />
                </div>
                <div className="flex justify-end">
                  <FinancialButton type="button" onClick={addRow}>
                    Add to grid
                  </FinancialButton>
                </div>
              </div>
            </div>
          </Panel>

          {gridRows.length > 0 ? (
            <Panel>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-textSecondary">
                Preview grid
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-textMuted">
                      <th className="py-2 pr-2">Party</th>
                      <th className="py-2 pr-2">Dheri</th>
                      <th className="py-2 pr-2">Variety</th>
                      <th className="py-2 pr-2 text-right">Weight</th>
                      <th className="py-2 pr-2 text-right">Rate</th>
                      <th className="py-2 pr-2 text-right">Amount</th>
                      <th className="py-2 pr-2 text-right">Bardana</th>
                      <th className="py-2 pr-2 text-right">B. Rate</th>
                      <th className="py-2 pr-2 text-right">Net</th>
                      <th className="py-2 pr-2 text-right">Bharti</th>
                      <th className="py-2 pr-2">Mode</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row) => (
                      <tr key={row.clientId} className="border-b border-border/60">
                        <td className="py-2 pr-2">{row.partyName}</td>
                        <td className="py-2 pr-2 tabular-nums">{row.bagCount}</td>
                        <td className="py-2 pr-2">{row.qism || row.jins || '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(row.totalWeightKg)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(row.ratePerMaund)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(row.amount)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {row.bardanaQty != null ? formatLedgerAmount(row.bardanaQty) : '—'}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {row.bardanaRate != null ? formatLedgerAmount(row.bardanaRate) : '—'}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(row.netCreditToParty)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatLedgerAmount(row.bhartii)}</td>
                        <td className="py-2 pr-2">{row.boriOrThelaMode === 'BORI' ? 'Bori' : 'Thela'}</td>
                        <td className="py-2 text-right">
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
            </Panel>
          ) : null}

          <Panel className="overflow-visible">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-textSecondary">
              Settlement (debit side)
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AccountPicker
                label="Debit account (whole invoice)"
                categoryNames={DEBIT_ACCOUNT_CATEGORIES}
                categories={categories}
                accounts={accounts}
                categoryId={debitCategoryId}
                accountId={debitAccountId}
                onCategoryChange={(id) => {
                  setDebitCategoryId(id);
                  setDebitAccountId('');
                }}
                onAccountChange={setDebitAccountId}
              />
              <div className="space-y-3">
                <ReadOnlyAmount label="Goods total" value={invoiceTotals.totalGoodsAmount} />
                <ReadOnlyAmount label={`Pale Dari (${prefRates.paleDariPercent}%)`} value={invoiceTotals.totalPaleDari} />
                <ReadOnlyAmount label={`Brokery (${prefRates.brokeryPercent}%)`} value={invoiceTotals.totalBrokery} />
                <ReadOnlyAmount
                  label={`Market fee (${prefRates.marketFeeRate} × ${invoiceTotals.totalCalculatedBags.toFixed(2)} bags)`}
                  value={invoiceTotals.marketFeeAmount}
                />
                <ReadOnlyAmount label={`Profit / Daami (${prefRates.daamiPercent}%)`} value={invoiceTotals.profitAmount} />
                <div>
                  <FieldLabel>Misc (optional)</FieldLabel>
                  <TextInput value={miscAmount} onChange={(e) => setMiscAmount(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <FieldLabel>Lower bardana — Bori / Thela</FieldLabel>
                  <SegmentedControl
                    value={lowerBoriThela}
                    onChange={(v) => setLowerBoriThela(v as BoriThelaMode)}
                    options={[
                      { value: 'BORI', label: 'Bori' },
                      { value: 'THELA', label: 'Thela' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Lower bardana qty</FieldLabel>
                    <TextInput value={lowerBardanaQty} onChange={(e) => setLowerBardanaQty(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <FieldLabel>Lower bardana rate</FieldLabel>
                    <TextInput value={lowerBardanaRate} onChange={(e) => setLowerBardanaRate(e.target.value)} inputMode="decimal" />
                  </div>
                </div>
                {invoiceTotals.lowerBardanaAmount != null ? (
                  <ReadOnlyAmount label="Lower bardana amount (separate posting)" value={invoiceTotals.lowerBardanaAmount} />
                ) : null}
                <div className="rounded-lg border-2 border-financial/30 bg-surface3 p-4">
                  <p className="text-xs font-semibold uppercase text-textMuted">Total debit (before lower bardana voucher)</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-financial">
                    {formatLedgerAmount(invoiceTotals.totalDebitAmount)}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <div className="flex justify-end">
            <FinancialButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save invoice'}
            </FinancialButton>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
