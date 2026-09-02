import { FormEvent, useEffect, useState } from 'react';
import { api, type Product } from '../../lib/api';
import { formatLedgerBalance } from '../../lib/format';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/PageShell';

export function ProductAddPage() {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceSide, setOpeningBalanceSide] = useState<'DR' | 'CR'>('DR');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const parsedOpening = openingBalance.trim() ? Number(openingBalance) : 0;
      if (openingBalance.trim() && !(parsedOpening >= 0)) {
        throw new Error('Opening balance must be zero or greater');
      }
      if (parsedOpening > 0 && openingBalanceSide !== 'DR' && openingBalanceSide !== 'CR') {
        throw new Error('Select Debit or Credit for the opening balance');
      }

      const product = await api.createProduct({
        name,
        unit: unit || undefined,
        ...(parsedOpening > 0
          ? { openingBalance: parsedOpening, openingBalanceSide }
          : {}),
      });

      if (parsedOpening > 0) {
        setMessage(
          `Product "${product.name}" submitted for approval with Maal Khata ${product.account?.name ?? ''} ` +
            `(opening ${formatLedgerBalance(parsedOpening)} ${openingBalanceSide}).`,
        );
      } else {
        setMessage(
          `Product "${product.name}" submitted for approval with Maal Khata ledger ${product.account?.name ?? ''}`.trim(),
        );
      }
      setName('');
      setUnit('');
      setOpeningBalance('');
      setOpeningBalanceSide('DR');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <PageShell title="Add Product" subtitle="Creates the product and its Maal Khata inventory ledger automatically">
      <Panel className="max-w-lg">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Product name</FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <FieldLabel>Unit (optional)</FieldLabel>
            <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. maund, kg" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Opening balance</FieldLabel>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00 (optional)"
              />
            </div>
            <div>
              <FieldLabel>Opening balance side</FieldLabel>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={openingBalanceSide}
                onChange={(e) => setOpeningBalanceSide(e.target.value as 'DR' | 'CR')}
                disabled={!openingBalance.trim() || Number(openingBalance) <= 0}
              >
                <option value="DR">Debit</option>
                <option value="CR">Credit</option>
              </select>
              <p className="mt-1 text-xs text-textMuted">
                Seeds the Maal Khata ledger; optional.
              </p>
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <PrimaryButton type="submit">Add Product</PrimaryButton>
        </form>
      </Panel>
    </PageShell>
  );
}

export function ProductRemovePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  async function onRemove() {
    setError('');
    setMessage('');
    try {
      if (!selectedId) throw new Error('Select a product');
      await api.removeProduct(Number(selectedId));
      setMessage('Product removed.');
      setSelectedId('');
      setProducts(await api.listProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <PageShell title="Remove Product" subtitle="Only products with zero ledger balance can be removed">
      <Panel className="max-w-lg space-y-4">
        <div>
          <FieldLabel>Product</FieldLabel>
          <select
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}
        <SecondaryButton onClick={onRemove}>Remove Product</SecondaryButton>
      </Panel>
    </PageShell>
  );
}
