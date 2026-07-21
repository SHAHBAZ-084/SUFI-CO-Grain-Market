import { FormEvent, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatLedgerBalance, formatVoucherLabel } from '../../lib/format';
import { api, Account, AccountCategory, Voucher, VoucherAccount, VoucherUser } from '../../lib/api';
import { DangerButton, FieldLabel, FinancialButton, PageShell, Panel, PrimaryButton, SecondaryButton, TextInput, Tile } from '../../components/ui/PageShell';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function AccountSideFields({
  label,
  categoryId,
  accountId,
  categories,
  accounts,
  onCategoryChange,
  onAccountChange,
  categoryTabIndex,
  accountTabIndex,
  categoryInputRef,
  accountInputRef,
  accountNextFocusRef,
  panelClassName = 'rounded-lg border border-border bg-surface1 p-4',
  labelClassName = 'text-accent',
}: {
  label: string;
  categoryId: string;
  accountId: string;
  categories: AccountCategory[];
  accounts: Account[];
  onCategoryChange: (id: string) => void;
  onAccountChange: (id: string) => void;
  categoryTabIndex: number;
  accountTabIndex: number;
  categoryInputRef: RefObject<HTMLInputElement | null>;
  accountInputRef: RefObject<HTMLInputElement | null>;
  accountNextFocusRef?: RefObject<HTMLElement | null>;
  panelClassName?: string;
  labelClassName?: string;
}) {
  const filteredAccounts = accounts.filter((a) => categoryId && String(a.categoryId) === categoryId);
  const selected = accounts.find((a) => String(a.id) === accountId);

  return (
    <div className={`${panelClassName} overflow-visible`}>
      <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${labelClassName}`}>{label}</p>
      <div className="space-y-3">
        <div>
          <FieldLabel>Category</FieldLabel>
          <SearchSelect
            inputRef={categoryInputRef}
            tabIndex={categoryTabIndex}
            value={categoryId}
            onChange={onCategoryChange}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="Search category…"
            nextFocusRef={accountInputRef}
            onSelected={() => {
              requestAnimationFrame(() => accountInputRef.current?.focus());
            }}
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
            placeholder={categoryId ? 'Search account…' : 'Select a category first'}
            disabled={!categoryId}
            nextFocusRef={accountNextFocusRef}
          />
        </div>
        {selected?.ledger ? (
          <p className="text-xs text-textSecondary">
            Current balance: {formatLedgerBalance(selected.ledger.balance)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function sidePanelStyle(
  variant: 'payment' | 'receipt' | 'journal',
  side: 'left' | 'right',
): { panel: string; label: string } {
  const base = 'rounded-lg border border-border p-4';
  if (variant === 'payment' && side === 'left') {
    return { panel: `${base} bg-bgDanger`, label: 'text-danger' };
  }
  if (variant === 'receipt' && side === 'right') {
    return { panel: `${base} bg-bgSuccess`, label: 'text-success' };
  }
  if (variant === 'journal' && side === 'left') {
    return { panel: `${base} bg-bgSuccess`, label: 'text-success' };
  }
  if (variant === 'journal' && side === 'right') {
    return { panel: `${base} bg-bgDanger`, label: 'text-danger' };
  }
  return { panel: `${base} bg-surface1`, label: 'text-textSecondary' };
}

function isBankOrCashCategory(name: string) {
  const n = name.trim().toLowerCase();
  return n.includes('bank') || n.includes('cash');
}

function categoriesForSide(
  all: AccountCategory[],
  kind: keyof typeof VOUCHER_TYPES,
  side: 'credit' | 'debit',
): AccountCategory[] {
  if (kind === 'journal') return all;
  const restricted =
    (kind === 'receipt' && side === 'debit') ||
    (kind === 'payment' && side === 'credit');
  if (!restricted) return all;
  const filtered = all.filter((c) => isBankOrCashCategory(c.name));
  return filtered.length > 0 ? filtered : all;
}

export function VoucherFormPage({ kind }: { kind: keyof typeof VOUCHER_TYPES }) {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const trapRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const leftCategoryRef = useRef<HTMLInputElement>(null);
  const leftAccountRef = useRef<HTMLInputElement>(null);
  const rightCategoryRef = useRef<HTMLInputElement>(null);
  const rightAccountRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(trapRef, {
    initialFocusRef: dateRef,
    escapeFocusRef: titleRef,
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<AccountCategory[]>([]);

  const [debitCategoryId, setDebitCategoryId] = useState('');
  const [creditCategoryId, setCreditCategoryId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayInputValue);
  const [predictedNumber, setPredictedNumber] = useState<number | null>(null);
  const [confirmedNumber, setConfirmedNumber] = useState<number | null>(null);
  const [numberMismatch, setNumberMismatch] = useState(false);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const refreshPredictedNumber = useCallback(() => {
    api
      .getNextVoucherNumber()
      .then(({ number }) => {
        setPredictedNumber(number);
        setNumberMismatch(false);
      })
      .catch(() => setPredictedNumber(null));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    refreshPredictedNumber();
  }, [refreshPredictedNumber]);

  const debitCategories = categoriesForSide(categories, kind, 'debit');
  const creditCategories = categoriesForSide(categories, kind, 'credit');

  useEffect(() => {
    if (debitCategoryId && !debitCategories.some((c) => String(c.id) === debitCategoryId)) {
      setDebitCategoryId('');
      setDebitAccountId('');
    }
    if (creditCategoryId && !creditCategories.some((c) => String(c.id) === creditCategoryId)) {
      setCreditCategoryId('');
      setCreditAccountId('');
    }
  }, [debitCategoryId, creditCategoryId, debitCategories, creditCategories]);

  const variant = kind; // 'payment' | 'journal' | 'receipt'
  const leftLabel = variant === 'journal' ? 'Debit' : 'From';
  const rightLabel = variant === 'journal' ? 'Credit' : 'To';

  const leftCategoryId = variant === 'journal' ? debitCategoryId : creditCategoryId;
  const rightCategoryId = variant === 'journal' ? creditCategoryId : debitCategoryId;
  const leftAccountId = variant === 'journal' ? debitAccountId : creditAccountId;
  const rightAccountId = variant === 'journal' ? creditAccountId : debitAccountId;

  function setLeftCategory(id: string) {
    if (variant === 'journal') { setDebitCategoryId(id); setDebitAccountId(''); }
    else { setCreditCategoryId(id); setCreditAccountId(''); }
  }
  function setRightCategory(id: string) {
    if (variant === 'journal') { setCreditCategoryId(id); setCreditAccountId(''); }
    else { setDebitCategoryId(id); setDebitAccountId(''); }
  }
  function setLeftAccount(id: string) {
    if (variant === 'journal') setDebitAccountId(id); else setCreditAccountId(id);
  }
  function setRightAccount(id: string) {
    if (variant === 'journal') setCreditAccountId(id); else setDebitAccountId(id);
  }

  function canSubmit() {
    return Boolean(
      debitAccountId
      && creditAccountId
      && debitAccountId !== creditAccountId
      && Number(amount) > 0,
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!debitAccountId || !creditAccountId) {
      setError('Select both accounts');
      return;
    }
    if (debitAccountId === creditAccountId) {
      setError('Debit and credit accounts must be different');
      return;
    }
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setError('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      const voucher = await api.createVoucher({
        type: VOUCHER_TYPES[kind],
        debitAccountId: Number(debitAccountId),
        creditAccountId: Number(creditAccountId),
        amount: parsedAmount,
        date: voucherDate,
        description: description || undefined,
        reference: reference || undefined,
      });
      const expected = predictedNumber;
      setConfirmedNumber(voucher.number);
      if (expected != null && voucher.number !== expected) {
        setNumberMismatch(true);
        setMessage(
          `Voucher ${formatVoucherLabel(VOUCHER_TYPES[kind], voucher.number)} posted (expected #${expected} — sequence changed).`,
        );
      } else {
        setNumberMismatch(false);
        setMessage(`Voucher ${formatVoucherLabel(VOUCHER_TYPES[kind], voucher.number)} posted (debit + credit pair).`);
      }
      setDebitCategoryId(''); setCreditCategoryId('');
      setDebitAccountId(''); setCreditAccountId('');
      setAmount(''); setReference(''); setDescription('');
      setConfirmedNumber(null);
      refreshPredictedNumber();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const voucherNumberDisplay =
    confirmedNumber != null
      ? formatVoucherLabel(VOUCHER_TYPES[kind], confirmedNumber)
      : predictedNumber != null
        ? formatVoucherLabel(VOUCHER_TYPES[kind], predictedNumber)
        : '';

  return (
    <PageShell centerTitle titleRef={titleRef} title={TITLES[kind]}>
      <Panel className="mx-auto max-w-4xl overflow-visible">
        <div ref={trapRef} className="overflow-visible">
          <form ref={formRef} className="space-y-6 overflow-visible" onSubmit={onSubmit}>
          <Tile className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                ref={dateRef}
                tabIndex={1}
                type="date"
                required
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 block text-sm font-medium text-textSecondary">Voucher #</p>
              <div
                className={`rounded-lg bg-surface1 px-3 py-2 ${numberMismatch ? 'ring-2 ring-accent' : ''}`}
              >
                <span className="text-lg font-semibold text-textFinancial">
                  {voucherNumberDisplay || '…'}
                </span>
              </div>
            </div>
          </Tile>

          <div className="grid gap-6 sm:grid-cols-2">
            <AccountSideFields
              label={leftLabel}
              categoryId={leftCategoryId}
              accountId={leftAccountId}
              categories={variant === 'journal' ? debitCategories : creditCategories}
              accounts={accounts}
              onCategoryChange={setLeftCategory}
              onAccountChange={setLeftAccount}
              categoryTabIndex={2}
              accountTabIndex={3}
              categoryInputRef={leftCategoryRef}
              accountInputRef={leftAccountRef}
              accountNextFocusRef={rightCategoryRef}
              panelClassName={sidePanelStyle(variant as 'payment' | 'receipt' | 'journal', 'left').panel}
              labelClassName={sidePanelStyle(variant as 'payment' | 'receipt' | 'journal', 'left').label}
            />
            <AccountSideFields
              label={rightLabel}
              categoryId={rightCategoryId}
              accountId={rightAccountId}
              categories={variant === 'journal' ? creditCategories : debitCategories}
              accounts={accounts}
              onCategoryChange={setRightCategory}
              onAccountChange={setRightAccount}
              categoryTabIndex={4}
              accountTabIndex={5}
              categoryInputRef={rightCategoryRef}
              accountInputRef={rightAccountRef}
              accountNextFocusRef={amountRef}
              panelClassName={sidePanelStyle(variant as 'payment' | 'receipt' | 'journal', 'right').panel}
              labelClassName={sidePanelStyle(variant as 'payment' | 'receipt' | 'journal', 'right').label}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Amount</FieldLabel>
              <TextInput
                ref={amountRef}
                tabIndex={6}
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="0.00"
              />
            </div>
            <div>
              <FieldLabel>Reference</FieldLabel>
              <TextInput
                ref={referenceRef}
                tabIndex={7}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <TextInput
              ref={descriptionRef}
              tabIndex={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes — press Enter to save when ready"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit() && !saving) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <div className="flex gap-3">
            <FinancialButton ref={saveRef} type="submit" tabIndex={9} disabled={saving}>
              {saving ? 'Saving…' : 'Save & Post'}
            </FinancialButton>
            <SecondaryButton type="button" tabIndex={10} onClick={() => navigate('/')}>
              Close
            </SecondaryButton>
          </div>
        </form>
        </div>
      </Panel>
    </PageShell>
  );
}

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Receipt',
  PAYMENT: 'Payment',
  JOURNAL: 'Journal',
};

function accountLabel(account?: VoucherAccount | null) {
  if (!account) return '—';
  return account.name;
}

function userLabel(user?: VoucherUser | null) {
  if (!user) return null;
  return user.displayName || user.username;
}

function VoucherDetailCard({
  voucher,
  onCancel,
  onUpdateAmount,
  cancelling,
  updating,
}: {
  voucher: Voucher;
  onCancel: () => void;
  onUpdateAmount: (amount: number) => void | Promise<void>;
  cancelling: boolean;
  updating: boolean;
}) {
  const isCancelled = voucher.status === 'CANCELLED';
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState(String(voucher.amount ?? ''));

  useEffect(() => {
    setEditingAmount(false);
    setAmountDraft(String(voucher.amount ?? ''));
  }, [voucher.id, voucher.amount]);

  const rows =
    voucher.type === 'JOURNAL'
      ? [
          { label: 'Debit', value: accountLabel(voucher.debitAccount) },
          { label: 'Credit', value: accountLabel(voucher.creditAccount) },
        ]
      : [
          { label: 'From', value: accountLabel(voucher.creditAccount) },
          { label: 'To', value: accountLabel(voucher.debitAccount) },
        ];

  const auditParts: string[] = [];
  const creator = userLabel(voucher.createdBy);
  if (creator) auditParts.push(`Created by ${creator}`);
  const modifier = userLabel(voucher.modifiedBy);
  if (modifier && voucher.updatedAt && voucher.updatedAt !== voucher.createdAt) {
    auditParts.push(`Updated by ${modifier} on ${new Date(voucher.updatedAt).toLocaleDateString()}`);
  }
  if (isCancelled && voucher.deletedBy && voucher.deletedAt) {
    const canceller = userLabel(voucher.deletedBy);
    if (canceller) auditParts.push(`Cancelled by ${canceller} on ${new Date(voucher.deletedAt).toLocaleDateString()}`);
  }

  async function submitAmount(e: FormEvent) {
    e.preventDefault();
    const amount = parseFloat(amountDraft);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await onUpdateAmount(amount);
    setEditingAmount(false);
  }

  return (
    <Panel className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-textPrimary">
              {formatVoucherLabel(voucher.type, voucher.number)}
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                isCancelled ? 'bg-bgAccent text-textAccent' : 'bg-bgAccent text-success'
              }`}
            >
              {isCancelled ? 'Cancelled' : 'Active'}
            </span>
          </div>
          <p className="mt-1 text-sm text-textSecondary">{formatDate(voucher.date)}</p>
        </div>
        {!isCancelled && (
          <div className="flex gap-2">
            {!editingAmount && (
              <SecondaryButton onClick={() => setEditingAmount(true)}>Update Amount</SecondaryButton>
            )}
            <DangerButton
              disabled={cancelling || editingAmount}
              onClick={onCancel}
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </DangerButton>
          </div>
        )}
      </div>

      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[120px_1fr] gap-4 py-3">
            <dt className="text-sm text-textSecondary">{row.label}</dt>
            <dd className="text-sm font-medium text-textPrimary">{row.value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[120px_1fr] gap-4 py-3">
          <dt className="text-sm text-textSecondary">Date</dt>
          <dd className="text-sm text-textPrimary">{formatDate(voucher.date)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-4 py-3">
          <dt className="text-sm text-textSecondary">Amount</dt>
          <dd className="text-sm font-semibold text-textPrimary">
            {editingAmount ? (
              <form onSubmit={submitAmount} className="flex flex-wrap items-center gap-2">
                <TextInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  className="max-w-[180px]"
                />
                <PrimaryButton type="submit" disabled={updating}>
                  {updating ? 'Saving…' : 'Save'}
                </PrimaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    setEditingAmount(false);
                    setAmountDraft(String(voucher.amount ?? ''));
                  }}
                >
                  Discard
                </SecondaryButton>
              </form>
            ) : (
              Number(voucher.amount).toFixed(2)
            )}
          </dd>
        </div>
        {voucher.reference ? (
          <div className="grid grid-cols-[120px_1fr] gap-4 py-3">
            <dt className="text-sm text-textSecondary">Reference</dt>
            <dd className="text-sm text-textPrimary">{voucher.reference}</dd>
          </div>
        ) : null}
        {voucher.description ? (
          <div className="grid grid-cols-[120px_1fr] gap-4 py-3">
            <dt className="text-sm text-textSecondary">Description</dt>
            <dd className="text-sm text-textPrimary">{voucher.description}</dd>
          </div>
        ) : null}
      </dl>

      {auditParts.length > 0 && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-textSecondary">
          {auditParts.join(' · ')}
        </p>
      )}
    </Panel>
  );
}

export function VoucherListPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchType, setSearchType] = useState('');
  const [searchNo, setSearchNo] = useState('');
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<Voucher | 'notfound' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadVouchers = useCallback(() => {
    setLoading(true);
    setLoadError('');
    api
      .listVouchers()
      .then(setVouchers)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load vouchers'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const no = parseInt(searchNo.trim(), 10);
    if (!no) {
      setResult('notfound');
      setSearched(true);
      return;
    }
    const found = vouchers.find((v) => v.number === no && (!searchType || v.type === searchType));
    setResult(found ?? 'notfound');
    setSearched(true);
  }

  async function handleCancel() {
    if (!result || result === 'notfound') return;
    const label = formatVoucherLabel(result.type, result.number);
    if (!window.confirm(`Cancel ${label}? Reversal entries will be posted.`)) return;
    setCancelling(true);
    try {
      const updated = await api.cancelVoucher(result.id);
      setResult(updated);
      loadVouchers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  async function handleUpdateAmount(amount: number) {
    if (!result || result === 'notfound') return;
    setUpdating(true);
    try {
      const updated = await api.updateVoucherAmount(result.id, amount);
      setResult(updated);
      loadVouchers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  const voucher = result && result !== 'notfound' ? result : null;

  return (
    <PageShell title="View Voucher" subtitle="Search a voucher by type and number">
      <Panel>
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : (
          <form onSubmit={handleSearch} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <FieldLabel>Type</FieldLabel>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="">All types</option>
                <option value="RECEIPT">Receipt</option>
                <option value="PAYMENT">Payment</option>
                <option value="JOURNAL">Journal</option>
              </select>
            </div>
            <div>
              <FieldLabel>Voucher #</FieldLabel>
              <TextInput
                type="number"
                min="1"
                required
                value={searchNo}
                onChange={(e) => setSearchNo(e.target.value)}
                placeholder="Enter voucher number"
              />
            </div>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Search'}
            </PrimaryButton>
          </form>
        )}
      </Panel>

      {searched && result === 'notfound' && (
        <p className="mt-4 rounded-lg border border-border bg-surface1 px-4 py-3 text-sm text-textMuted">
          No voucher found for that number{searchType ? ` in ${VOUCHER_TYPE_LABELS[searchType]}` : ''}.
        </p>
      )}

      {voucher && (
        <VoucherDetailCard
          voucher={voucher}
          onCancel={handleCancel}
          onUpdateAmount={handleUpdateAmount}
          cancelling={cancelling}
          updating={updating}
        />
      )}
    </PageShell>
  );
}
