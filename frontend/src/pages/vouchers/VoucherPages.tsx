import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { FieldLabel, PageShell, Panel, PrimaryButton, TextInput } from '../../components/ui/PageShell';

const VOUCHER_TYPES: Record<string, string> = {
  payment: 'PAYMENT',
  journal: 'JOURNAL',
  receipt: 'RECEIPT',
};

const TITLES: Record<string, string> = {
  payment: 'Payment Voucher',
  journal: 'Journal Voucher',
  receipt: 'Receipt Voucher',
};

export function VoucherFormPage({ kind }: { kind: keyof typeof VOUCHER_TYPES }) {
  const [accounts, setAccounts] = useState<{ id: number; name: string; code: string }[]>([]);
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const voucher = await api.createVoucher({
        type: VOUCHER_TYPES[kind],
        debitAccountId: Number(debitAccountId),
        creditAccountId: Number(creditAccountId),
        amount: Number(amount),
        description: description || undefined,
      });
      setMessage(`Voucher #${voucher.number} posted (debit + credit pair).`);
      setAmount('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <PageShell title={TITLES[kind]} subtitle="Posts a balanced debit + credit voucher pair">
      <Panel className="max-w-xl">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Debit account (To)</FieldLabel>
            <select
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={debitAccountId}
              onChange={(e) => setDebitAccountId(e.target.value)}
              required
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Credit account (From)</FieldLabel>
            <select
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={creditAccountId}
              onChange={(e) => setCreditAccountId(e.target.value)}
              required
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Amount</FieldLabel>
            <TextInput type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          <PrimaryButton type="submit">Post Voucher</PrimaryButton>
        </form>
      </Panel>
    </PageShell>
  );
}

export function VoucherListPage() {
  const [vouchers, setVouchers] = useState<Awaited<ReturnType<typeof api.listVouchers>>>([]);

  useEffect(() => {
    api.listVouchers().then(setVouchers).catch(() => setVouchers([]));
  }, []);

  return (
    <PageShell title="View Voucher" subtitle="All payment, receipt, and journal vouchers">
      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="py-2">No.</th>
              <th className="py-2">Type</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Reference</th>
              <th className="py-2">Status</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-b border-stone-100">
                <td className="py-2">{v.number}</td>
                <td className="py-2">{v.type}</td>
                <td className="py-2">{Number(v.amount).toFixed(2)}</td>
                <td className="py-2">{v.reference ?? '—'}</td>
                <td className="py-2">{v.status}</td>
                <td className="py-2">{new Date(v.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vouchers.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">No vouchers yet.</p> : null}
      </Panel>
    </PageShell>
  );
}
