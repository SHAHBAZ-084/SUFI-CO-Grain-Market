import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateField } from '../../components/ui/DateField';
import {
  FieldLabel,
  FinancialButton,
  PageShell,
  Panel,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { api, Account, AccountCategory, Product, ProductCategory } from '../../lib/api';
import { formatLedgerAmount } from '../../lib/format';
import { invoiceLoadErrorMessage, loadInvoiceFormBase } from '../../lib/invoiceFormLoad';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMinimizableForm } from '../../hooks/useMinimizableForm';
import { SALE_PARTY_CATEGORIES } from '../../lib/salePaunchCalculations';

const PURCHASE_PARTY_CATEGORIES = [
  'Int. Purchase Party',
  'Ext. Purchase Party',
  'Sale Party',
] as const;

type GridRow = {
  key: string;
  productId: number;
  productName: string;
  unit: string | null;
  quantity: number;
  purchaseRate: number;
  purchaseTotal: number;
  mazduriAmount: number;
  saleRate: number;
  saleTotal: number;
};

type Draft = {
  predictedRef: string;
  invoiceDate: string;
  billNo: string;
  tafseel: string;
  partyAccountId: string;
  salePartyAccountId: string;
  productCategoryId: string;
  productId: string;
  quantity: string;
  purchaseRate: string;
  mazduriEnabled: boolean;
  mazduriAmount: string;
  gridRows: GridRow[];
};

function todayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
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

export function GeneralTradeInvoicePage() {
  const navigate = useNavigate();
  const { restoredState, minimize } = useMinimizableForm<Draft>('general-trade');
  const keepRestoredPredictedRef = useRef(Boolean(restoredState?.predictedRef));
  const trapRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useFocusTrap(trapRef, { initialFocusRef: dateRef });

  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [predictedRef, setPredictedRef] = useState(() => restoredState?.predictedRef ?? '');
  const [gridRows, setGridRows] = useState<GridRow[]>(() => restoredState?.gridRows ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [invoiceDate, setInvoiceDate] = useState(() => restoredState?.invoiceDate ?? todayInputValue());
  const [billNo, setBillNo] = useState(() => restoredState?.billNo ?? '');
  const [tafseel, setTafseel] = useState(() => restoredState?.tafseel ?? '');
  const [partyAccountId, setPartyAccountId] = useState(() => restoredState?.partyAccountId ?? '');
  const [salePartyAccountId, setSalePartyAccountId] = useState(
    () => restoredState?.salePartyAccountId ?? '',
  );
  const [productCategoryId, setProductCategoryId] = useState(
    () => restoredState?.productCategoryId ?? '',
  );
  const [productId, setProductId] = useState(() => restoredState?.productId ?? '');
  const [quantity, setQuantity] = useState(() => restoredState?.quantity ?? '');
  const [purchaseRate, setPurchaseRate] = useState(() => restoredState?.purchaseRate ?? '');
  const [mazduriEnabled, setMazduriEnabled] = useState(() => restoredState?.mazduriEnabled ?? false);
  const [mazduriAmount, setMazduriAmount] = useState(() => restoredState?.mazduriAmount ?? '');

  const purchasePartyOptions = useMemo(
    () => flatAccountOptions(categories, accounts, PURCHASE_PARTY_CATEGORIES),
    [categories, accounts],
  );
  const salePartyOptions = useMemo(
    () => flatAccountOptions(categories, accounts, SALE_PARTY_CATEGORIES),
    [categories, accounts],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.category?.stockMode === 'QUANTITY'
          && (!productCategoryId || String(p.categoryId) === productCategoryId),
      ),
    [products, productCategoryId],
  );

  const productOptions = useMemo(
    () =>
      filteredProducts.map((p) => ({
        value: String(p.id),
        label: p.unit ? `${p.name} (${p.unit})` : p.name,
      })),
    [filteredProducts],
  );

  const showMazduriColumn = useMemo(
    () => mazduriEnabled || gridRows.some((r) => r.mazduriAmount > 0),
    [mazduriEnabled, gridRows],
  );

  const purchaseGoodsTotal = useMemo(
    () => roundMoney(gridRows.reduce((s, r) => s + r.purchaseTotal, 0)),
    [gridRows],
  );
  const saleGoodsTotal = useMemo(
    () => roundMoney(gridRows.reduce((s, r) => s + r.saleTotal, 0)),
    [gridRows],
  );

  const reload = useCallback(async () => {
    const base = await loadInvoiceFormBase({ includeProducts: true });
    setAccounts(base.accounts);
    setCategories(base.categories);
    const [cats, qtyProducts] = await Promise.all([
      api.listProductCategories('QUANTITY'),
      api.listProducts({ stockMode: 'QUANTITY' }),
    ]);
    setProductCategories(cats);
    setProducts(qtyProducts);
    try {
      const refRow = await api.getNextGeneralTradeReference();
      if (keepRestoredPredictedRef.current) {
        keepRestoredPredictedRef.current = false;
      } else {
        setPredictedRef(refRow.reference);
      }
    } catch {
      if (!keepRestoredPredictedRef.current) setPredictedRef('');
      keepRestoredPredictedRef.current = false;
    }
  }, []);

  useEffect(() => {
    reload().catch((err) => setError(invoiceLoadErrorMessage(err)));
  }, [reload]);

  function addToGrid() {
    setError('');
    setMessage('');
    if (!productId) {
      setError('Select a product');
      return;
    }
    const product = filteredProducts.find((p) => String(p.id) === productId);
    if (!product) {
      setError('Invalid product');
      return;
    }
    const qty = parseNum(quantity);
    const buyRate = parseNum(purchaseRate);
    if (!(qty > 0) || !(buyRate > 0)) {
      setError('Quantity and purchase rate must be greater than zero');
      return;
    }
    const maz = mazduriEnabled ? Math.max(0, parseNum(mazduriAmount)) : 0;
    setGridRows((rows) => [
      ...rows,
      {
        key: `${Date.now()}-${product.id}`,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: qty,
        purchaseRate: buyRate,
        purchaseTotal: roundMoney(qty * buyRate),
        mazduriAmount: roundMoney(maz),
        saleRate: 0,
        saleTotal: 0,
      },
    ]);
    setProductId('');
    setQuantity('');
    setPurchaseRate('');
    setMazduriAmount('');
  }

  function updateSaleRate(key: string, value: string) {
    const rate = Math.max(0, parseNum(value));
    setGridRows((rows) =>
      rows.map((row) =>
        row.key === key
          ? {
              ...row,
              saleRate: rate,
              saleTotal: roundMoney(row.quantity * rate),
            }
          : row,
      ),
    );
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!partyAccountId) {
      setError('Select a purchase party');
      return;
    }
    if (!salePartyAccountId) {
      setError('Select a sale party');
      return;
    }
    if (gridRows.length === 0) {
      setError('Add at least one line to the grid');
      return;
    }
    const missingSale = gridRows.find((r) => !(r.saleRate > 0));
    if (missingSale) {
      setError(`Enter a sale rate for ${missingSale.productName}`);
      return;
    }
    setSaving(true);
    try {
      const result = await api.createGeneralTradeInvoice({
        invoiceDate,
        partyAccountId: Number(partyAccountId),
        salePartyAccountId: Number(salePartyAccountId),
        billNo: billNo.trim() || undefined,
        tafseel: tafseel.trim() || undefined,
        lines: gridRows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
          purchaseRate: row.purchaseRate,
          saleRate: row.saleRate,
          mazduriAmount: row.mazduriAmount > 0 ? row.mazduriAmount : undefined,
        })),
      });
      setMessage(`Invoice ${result.reference} submitted for approval.`);
      setGridRows([]);
      setMazduriEnabled(false);
      const refRow = await api.getNextGeneralTradeReference();
      setPredictedRef(refRow.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      centerTitle
      invoiceTitleBand
      title="General Trade"
      className="app-page--general-trade"
    >
      <div ref={trapRef}>
        <Panel>
          <form className="space-y-4" onSubmit={onSave}>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <FieldLabel>Invoice #</FieldLabel>
                <TextInput value={predictedRef} readOnly />
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <DateField
                  ref={dateRef}
                  value={invoiceDate}
                  onChange={setInvoiceDate}
                  required
                />
              </div>
              <div>
                <FieldLabel>Bill No</FieldLabel>
                <TextInput value={billNo} onChange={(e) => setBillNo(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Tafseel</FieldLabel>
                <TextInput value={tafseel} onChange={(e) => setTafseel(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <FieldLabel>Purchase Party</FieldLabel>
                <SearchSelect
                  value={partyAccountId}
                  onChange={setPartyAccountId}
                  options={purchasePartyOptions}
                  placeholder="Search purchase party…"
                />
              </div>
              <div>
                <FieldLabel>Sale Party</FieldLabel>
                <SearchSelect
                  value={salePartyAccountId}
                  onChange={setSalePartyAccountId}
                  options={salePartyOptions}
                  placeholder="Search sale party…"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface1/40 p-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textSecondary">
                Purchase line
              </h3>
              <div className="grid gap-3 md:grid-cols-6 md:items-end">
                <div className="md:col-span-2">
                  <FieldLabel>Product category</FieldLabel>
                  <SearchSelect
                    value={productCategoryId}
                    onChange={(id) => {
                      setProductCategoryId(id);
                      setProductId('');
                    }}
                    options={productCategories.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                    placeholder="All categories…"
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Product</FieldLabel>
                  <SearchSelect
                    value={productId}
                    onChange={setProductId}
                    options={productOptions}
                    placeholder="Search product…"
                  />
                </div>
                <div>
                  <FieldLabel>Qty</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Purchase rate</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="any"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(e.target.value)}
                  />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mazduriEnabled}
                  onChange={(e) => setMazduriEnabled(e.target.checked)}
                />
                Apply Mazduri
              </label>
              {mazduriEnabled ? (
                <div className="mt-2 max-w-xs">
                  <FieldLabel>Mazduri amount</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={mazduriAmount}
                    onChange={(e) => setMazduriAmount(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="mt-3">
                <FinancialButton type="button" onClick={addToGrid}>
                  Add to grid
                </FinancialButton>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-textSecondary">
                Trade grid (qty locked — enter sale rate)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-textSecondary">
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3 text-right">Buy rate</th>
                      <th className="py-2 pr-3 text-right">Buy total</th>
                      {showMazduriColumn ? (
                        <th className="py-2 pr-3 text-right">Mazduri</th>
                      ) : null}
                      <th className="py-2 pr-3 text-right">Sale rate</th>
                      <th className="py-2 pr-3 text-right">Sale total</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={showMazduriColumn ? 8 : 7}
                          className="py-6 text-center text-textSecondary"
                        >
                          No lines yet — add a purchase line above.
                        </td>
                      </tr>
                    ) : (
                      gridRows.map((row) => (
                        <tr key={row.key} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            {row.productName}
                            {row.unit ? ` (${row.unit})` : ''}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.quantity}</td>
                          <td className="py-2 pr-3 text-right">
                            {formatLedgerAmount(row.purchaseRate)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {formatLedgerAmount(row.purchaseTotal)}
                          </td>
                          {showMazduriColumn ? (
                            <td className="py-2 pr-3 text-right">
                              {formatLedgerAmount(row.mazduriAmount)}
                            </td>
                          ) : null}
                          <td className="py-2 pr-3 text-right">
                            <TextInput
                              type="number"
                              min="0"
                              step="any"
                              className="ml-auto w-28 text-right"
                              value={row.saleRate > 0 ? String(row.saleRate) : ''}
                              onChange={(e) => updateSaleRate(row.key, e.target.value)}
                              placeholder="Sale rate"
                              required
                            />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {formatLedgerAmount(row.saleTotal)}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              className="text-sm text-danger"
                              onClick={() =>
                                setGridRows((rows) => rows.filter((r) => r.key !== row.key))
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-textSecondary">
                <p>
                  Purchase goods: <strong>{formatLedgerAmount(purchaseGoodsTotal)}</strong>
                </p>
                <p>
                  Sale total: <strong>{formatLedgerAmount(saleGoodsTotal)}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <SecondaryButton type="button" onClick={() => navigate('/')}>
                  Close
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() =>
                    minimize(
                      {
                        predictedRef,
                        invoiceDate,
                        billNo,
                        tafseel,
                        partyAccountId,
                        salePartyAccountId,
                        productCategoryId,
                        productId,
                        quantity,
                        purchaseRate,
                        mazduriEnabled,
                        mazduriAmount,
                        gridRows,
                      },
                      predictedRef || 'General Trade',
                    )
                  }
                >
                  Minimize
                </SecondaryButton>
                <FinancialButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save invoice'}
                </FinancialButton>
              </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-success">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
