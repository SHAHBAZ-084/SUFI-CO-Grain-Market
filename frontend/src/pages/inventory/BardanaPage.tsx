import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { FieldLabel, PageShell, Panel, PrimaryButton, TextInput } from '../../components/ui/PageShell';

export function BardanaPage() {
  const [rows, setRows] = useState<{ id: number; name: string; quantity: number | string; unit: string }[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [message, setMessage] = useState('');

  async function refresh() {
    setRows(await api.listBardana());
  }

  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await api.createBardana({ name, quantity: Number(quantity) });
    setMessage('Bardana record added.');
    setName('');
    setQuantity('0');
    await refresh();
  }

  return (
    <PageShell title="Bardana" subtitle="Inventory stock — bardana bags">
      <Panel className="mb-4 max-w-lg">
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={onSubmit}>
          <div className="sm:col-span-2">
            <FieldLabel>Name</FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <FieldLabel>Quantity</FieldLabel>
            <TextInput type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <PrimaryButton type="submit">Add</PrimaryButton>
          </div>
        </form>
        {message ? <p className="mt-2 text-sm text-green-700">{message}</p> : null}
      </Panel>
      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="py-2">Name</th>
              <th className="py-2">Quantity</th>
              <th className="py-2">Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-stone-100">
                <td className="py-2">{row.name}</td>
                <td className="py-2">{Number(row.quantity).toFixed(2)}</td>
                <td className="py-2">{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </PageShell>
  );
}
