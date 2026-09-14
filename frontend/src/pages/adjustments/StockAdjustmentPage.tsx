import { FormEvent, useEffect, useState } from 'react';
import { notifyApprovalsChanged } from '../../lib/approvals';
import { api, type Product } from '../../lib/api';
import { DateField } from '../../components/ui/DateField';
import { FieldLabel, PageShell, Panel, PrimaryButton, TextInput } from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function StockAdjustmentPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [bagType, setBagType] = useState<'BORI' | 'THELA'>('THELA');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [bags, setBags] = useState('');
  const [kg, setKg] = useState('');
  const [amount, setAmount] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(todayInputValue());
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const productOptions = products.map((p) => ({
    value: String(p.id),
    label: p.name,
  }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const id = parseInt(productId, 10);
      const bagQty = bags.trim() === '' ? 0 : parseFloat(bags);
      const kgQty = kg.trim() === '' ? 0 : parseFloat(kg);
      const value = parseFloat(amount);
      if (!Number.isFinite(id) || id < 1) throw new Error('Select a product');
      if (!Number.isFinite(bagQty) || bagQty < 0) throw new Error('Enter a valid bag quantity (or leave blank)');
      if (!Number.isFinite(kgQty) || kgQty < 0) throw new Error('Enter a valid KG amount (or leave blank)');
      if (!(bagQty > 0) && !(kgQty > 0)) {
        throw new Error('Enter bags, KG, or both (at least one must be greater than zero)');
      }
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a valid ledger amount');

      await api.createStockAdjustment({
        productId: id,
        bagType,
        direction,
        bags: bagQty,
        kg: kgQty,
        amount: value,
        adjustmentDate,
        notes: notes.trim() || undefined,
      });
      setMessage('Stock adjustment submitted for approval.');
      notifyApprovalsChanged();
      setBags('');
      setKg('');
      setAmount('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit adjustment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="Stock Adjustment"
      subtitle="Correct bag/KG stock and Maal Khata ledger value — posts after admin approval. Use IN + past date to seed opening stock that existed before tracking."
    >
      <Panel>
        <p className="mb-4 text-sm text-textMuted">
          IN increases stock (debits Maal Khata); OUT decreases stock (credits Maal Khata). Bags and
          KG are independent — enter either or both. OUT is blocked if bag count would go below
          zero. Date can be any day in the active financial year (not limited to today).
        </p>
        <form className="max-w-md space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Product</FieldLabel>
            <SearchSelect
              value={productId}
              onChange={setProductId}
              options={productOptions}
              placeholder="Select product…"
            />
          </div>
          <div>
            <FieldLabel>Bag type</FieldLabel>
            <select
              className="app-input"
              value={bagType}
              onChange={(e) => setBagType(e.target.value as 'BORI' | 'THELA')}
            >
              <option value="THELA">Thela</option>
              <option value="BORI">Bori</option>
            </select>
          </div>
          <div>
            <FieldLabel>Direction</FieldLabel>
            <select
              className="app-input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
            >
              <option value="IN">IN (add stock)</option>
              <option value="OUT">OUT (remove stock)</option>
            </select>
          </div>
          <div>
            <FieldLabel>Bags (optional)</FieldLabel>
            <TextInput
              type="number"
              min="0"
              step="1"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
              placeholder="e.g. 1200"
            />
          </div>
          <div>
            <FieldLabel>KG (optional)</FieldLabel>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="e.g. 3000"
            />
          </div>
          <div>
            <FieldLabel>Ledger amount (Rs)</FieldLabel>
            <TextInput
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel>Date</FieldLabel>
            <DateField
              value={adjustmentDate}
              onChange={setAdjustmentDate}
              required
            />
          </div>
          <div>
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit for approval'}
          </PrimaryButton>
        </form>
      </Panel>
    </PageShell>
  );
}
