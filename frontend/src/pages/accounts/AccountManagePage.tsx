import { FormEvent, useEffect, useState } from 'react';
import { api, type Account, type AccountCategory } from '../../lib/api';
import { FieldLabel, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput } from '../../components/ui/PageShell';

type Mode = 'add' | 'edit' | 'remove';

const copy: Record<Mode, { title: string; subtitle: string }> = {
  add: { title: 'Add Account', subtitle: 'Create a new account under a category' },
  edit: { title: 'Edit Account', subtitle: 'Rename an existing account' },
  remove: { title: 'Remove Account', subtitle: 'Soft-delete an account' },
};

export function AccountManagePage({ mode }: { mode: Mode }) {
  const [categories, setCategories] = useState<AccountCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (mode === 'edit' && selectedId) {
      const account = accounts.find((a) => a.id === selectedId);
      setName(account?.name ?? '');
    }
  }, [selectedId, accounts, mode]);

  async function reload() {
    setCategories(await api.listCategories());
    setAccounts(await api.listAccounts());
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (mode === 'add') {
        if (!categoryId) throw new Error('Select a category');
        await api.createAccount({ categoryId: Number(categoryId), name });
        setMessage('Account created.');
        setCategoryId('');
        setName('');
      } else if (mode === 'edit') {
        if (!selectedId) throw new Error('Select an account');
        await api.updateAccount(Number(selectedId), { name });
        setMessage('Account updated.');
        setSelectedId('');
        setName('');
      } else {
        if (!selectedId) throw new Error('Select an account');
        await api.removeAccount(Number(selectedId));
        setMessage('Account removed.');
        setSelectedId('');
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  const { title, subtitle } = copy[mode];

  return (
    <PageShell title={title} subtitle={subtitle}>
      <Panel className="max-w-lg">
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === 'add' ? (
            <>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Account name</FieldLabel>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </>
          ) : (
            <>
              <div>
                <FieldLabel>Account</FieldLabel>
                <select
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {mode === 'edit' ? (
                <div>
                  <FieldLabel>Account name</FieldLabel>
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              ) : null}
            </>
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          <div className="flex gap-2">
            <PrimaryButton type="submit">{mode === 'remove' ? 'Remove' : 'Save'}</PrimaryButton>
            <SecondaryButton type="button" onClick={() => { setCategoryId(''); setName(''); setSelectedId(''); }}>Clear</SecondaryButton>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}
