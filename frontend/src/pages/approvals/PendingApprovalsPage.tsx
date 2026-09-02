import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { INVOICE_TYPE_LABELS } from '../../config/navigation';
import {
  DangerButton,
  FieldLabel,
  FormRow,
  LegacyTable,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { useAuth } from '../../contexts/AuthContext';
import {
  api,
  type ApprovalKind,
  type PendingApprovalDetail,
  type PendingApprovalItem,
} from '../../lib/api';
import {
  formatDate,
  formatLedgerAmount,
  formatVoucherNumber,
  formatVoucherTypeLabel,
} from '../../lib/format';
import { notifyApprovalsChanged } from '../../lib/approvals';

const KIND_LABELS: Record<ApprovalKind, string> = {
  account: 'Account',
  product: 'Product',
  voucher: 'Voucher',
  invoice: 'Invoice',
  'account-adjustment': 'Account Adj.',
  'stock-adjustment': 'Stock Adj.',
};

const KIND_FILTERS: Array<{ value: 'all' | ApprovalKind; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'account', label: 'Accounts' },
  { value: 'product', label: 'Products' },
  { value: 'voucher', label: 'Vouchers' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'account-adjustment', label: 'Acct Adj.' },
  { value: 'stock-adjustment', label: 'Stock Adj.' },
];

function recordCreatedById(record: Record<string, unknown>): number | null {
  const id = record.createdById;
  return typeof id === 'number' ? id : null;
}

function recordString(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '—';
}

function recordNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateInputValue(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <FormRow label={label}>
      <span className="text-sm text-textPrimary">{value}</span>
    </FormRow>
  );
}

function ApprovalDetailPanel({
  detail,
  isAdmin,
  canEdit,
  onApprove,
  onReject,
  onSaved,
}: {
  detail: PendingApprovalDetail;
  isAdmin: boolean;
  canEdit: boolean;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const { kind, record } = detail;
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editObAmount, setEditObAmount] = useState('');
  const [editObSide, setEditObSide] = useState<'DR' | 'CR'>('DR');
  const [editReference, setEditReference] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBillNo, setEditBillNo] = useState('');
  const [editGariNo, setEditGariNo] = useState('');
  const [editTafseel, setEditTafseel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editBags, setEditBags] = useState('');
  const [editBagType, setEditBagType] = useState<'BORI' | 'THELA'>('BORI');
  const [editDirection, setEditDirection] = useState<'IN' | 'OUT'>('IN');

  useEffect(() => {
    setError('');
    setMessage('');
    setEditName(recordString(record.name));
    setEditUnit(recordString(record.unit === null ? '' : record.unit));
    setEditObAmount(recordNumber(record.pendingOpeningBalance)?.toString() ?? '0');
    setEditObSide(record.side === 'CR' ? 'CR' : record.pendingOpeningBalanceSide === 'CR' ? 'CR' : 'DR');
    setEditReference(recordString(record.reference === null ? '' : record.reference));
    setEditDescription(recordString(record.description === null ? '' : record.description));
    setEditAmount(recordNumber(record.amount)?.toString() ?? '');
    setEditDate(toDateInputValue(record.date ?? record.voucherDate ?? record.adjustmentDate));
    setEditBillNo(recordString(record.billNo === null ? '' : record.billNo));
    setEditGariNo(recordString(record.gariNo === null ? '' : record.gariNo));
    setEditTafseel(recordString(record.tafseel === null ? '' : record.tafseel));
    setEditNotes(recordString(record.notes === null ? '' : record.notes));
    setEditInvoiceDate(toDateInputValue(record.invoiceDate));
    setEditBags(recordNumber(record.bags)?.toString() ?? '');
    setEditBagType(record.bagType === 'THELA' ? 'THELA' : 'BORI');
    setEditDirection(record.direction === 'OUT' ? 'OUT' : 'IN');
  }, [detail, record]);

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const id = Number(record.id);
      if (kind === 'account') {
        await api.patchPendingApproval(kind, id, {
          name: editName.trim(),
          pendingOpeningBalance: Number(editObAmount),
          pendingOpeningBalanceSide: editObSide,
        });
      } else if (kind === 'product') {
        await api.patchPendingApproval(kind, id, {
          name: editName.trim(),
          unit: editUnit.trim(),
        });
      } else if (kind === 'voucher') {
        await api.patchPendingApproval(kind, id, {
          reference: editReference.trim(),
          description: editDescription.trim(),
          amount: Number(editAmount),
          date: editDate,
        });
      } else if (kind === 'invoice') {
        await api.patchPendingApproval(kind, id, {
          billNo: editBillNo.trim(),
          gariNo: editGariNo.trim(),
          tafseel: editTafseel.trim(),
          notes: editNotes.trim(),
          invoiceDate: editInvoiceDate,
        });
      } else if (kind === 'account-adjustment') {
        await api.patchPendingApproval(kind, id, {
          amount: Number(editAmount),
          side: editObSide,
          adjustmentDate: editDate,
          notes: editNotes.trim(),
        });
      } else if (kind === 'stock-adjustment') {
        await api.patchPendingApproval(kind, id, {
          bags: Number(editBags),
          amount: Number(editAmount),
          direction: editDirection,
          bagType: editBagType,
          adjustmentDate: editDate,
          notes: editNotes.trim(),
        });
      }
      setMessage('Changes saved.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!window.confirm('Approve this record? It will be posted to the ledger/stock.')) return;
    setActing('approve');
    setError('');
    setMessage('');
    try {
      await onApprove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!window.confirm('Reject this record? It will not be posted.')) return;
    setActing('reject');
    setError('');
    setMessage('');
    try {
      await onReject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setActing(null);
    }
  }

  const createdBy = record.createdBy as { displayName?: string; username?: string } | null | undefined;
  const category = record.category as { name?: string } | null | undefined;
  const debitAccount = record.debitAccount as { name?: string; code?: string } | null | undefined;
  const creditAccount = record.creditAccount as { name?: string; code?: string } | null | undefined;
  const product = record.product as { name?: string; code?: string } | null | undefined;
  const adjustmentAccount = record.account as { name?: string; code?: string } | null | undefined;
  const adjustmentProduct = record.product as { name?: string; code?: string } | null | undefined;
  const linkedAccount = record.account as
    | {
        name?: string;
        code?: string;
        pendingOpeningBalance?: number | string | null;
        pendingOpeningBalanceSide?: string | null;
        category?: { name?: string } | null;
      }
    | null
    | undefined;

  const lineCount =
    (Array.isArray(record.kachiMaalLines) ? record.kachiMaalLines.length : 0) +
    (Array.isArray(record.purchaseMaalLines) ? record.purchaseMaalLines.length : 0) +
    (Array.isArray(record.saleCommissionLines) ? record.saleCommissionLines.length : 0) +
    (Array.isArray(record.salePaunchLines) ? record.salePaunchLines.length : 0);

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-textPrimary">
          {KIND_LABELS[kind]} detail
        </h2>
        {isAdmin ? (
          <div className="flex gap-2">
            <PrimaryButton
              type="button"
              disabled={acting != null}
              onClick={() => void handleApprove()}
            >
              {acting === 'approve' ? 'Approving…' : 'Approve'}
            </PrimaryButton>
            <DangerButton
              type="button"
              disabled={acting != null}
              onClick={() => void handleReject()}
            >
              {acting === 'reject' ? 'Rejecting…' : 'Reject'}
            </DangerButton>
          </div>
        ) : null}
      </div>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-success">{message}</p> : null}

      <DetailField label="Submitted by" value={createdBy?.displayName ?? createdBy?.username ?? '—'} />
      <DetailField label="Submitted on" value={formatDate(String(record.createdAt ?? ''))} />

      {kind === 'account' ? (
        <>
          <DetailField label="Name" value={recordString(record.name)} />
          <DetailField label="Code" value={recordString(record.code)} />
          <DetailField label="Type" value={recordString(record.type)} />
          <DetailField label="Category" value={category?.name ?? '—'} />
          <DetailField
            label="Opening balance"
            value={
              recordNumber(record.pendingOpeningBalance) != null
                ? `${formatLedgerAmount(recordNumber(record.pendingOpeningBalance)!)} ${record.pendingOpeningBalanceSide ?? 'DR'}`
                : '—'
            }
          />
        </>
      ) : null}

      {kind === 'product' ? (
        <>
          <DetailField label="Name" value={recordString(record.name)} />
          <DetailField label="Code" value={recordString(record.code)} />
          <DetailField label="Unit" value={recordString(record.unit)} />
          <DetailField
            label="Maal Khata account"
            value={linkedAccount ? `${linkedAccount.name} (${linkedAccount.code})` : '—'}
          />
          <DetailField label="Account category" value={linkedAccount?.category?.name ?? '—'} />
          <DetailField
            label="Pending opening balance"
            value={
              recordNumber(linkedAccount?.pendingOpeningBalance) != null
                ? `${formatLedgerAmount(recordNumber(linkedAccount?.pendingOpeningBalance)!)} ${linkedAccount?.pendingOpeningBalanceSide ?? 'DR'}`
                : '—'
            }
          />
        </>
      ) : null}

      {kind === 'voucher' ? (
        <>
          <DetailField
            label="Voucher"
            value={`${formatVoucherTypeLabel(String(record.type))} ${formatVoucherNumber(recordNumber(record.number))}`}
          />
          <DetailField label="Date" value={formatDate(String(record.date ?? ''))} />
          <DetailField label="Amount" value={formatLedgerAmount(String(record.amount ?? 0))} />
          <DetailField
            label="Debit"
            value={debitAccount ? `${debitAccount.name} (${debitAccount.code})` : '—'}
          />
          <DetailField
            label="Credit"
            value={creditAccount ? `${creditAccount.name} (${creditAccount.code})` : '—'}
          />
          <DetailField label="Reference" value={recordString(record.reference)} />
          <DetailField label="Description" value={recordString(record.description)} />
        </>
      ) : null}

      {kind === 'invoice' ? (
        <>
          <DetailField label="Reference" value={recordString(record.reference)} />
          <DetailField
            label="Type"
            value={INVOICE_TYPE_LABELS[String(record.type)] ?? recordString(record.type)}
          />
          <DetailField label="Invoice date" value={formatDate(String(record.invoiceDate ?? ''))} />
          <DetailField label="Total" value={formatLedgerAmount(String(record.total ?? 0))} />
          <DetailField
            label="Party account"
            value={debitAccount ? `${debitAccount.name} (${debitAccount.code})` : '—'}
          />
          <DetailField
            label="Product"
            value={product ? `${product.name} (${product.code})` : '—'}
          />
          <DetailField label="Bill no." value={recordString(record.billNo)} />
          <DetailField label="Gari no." value={recordString(record.gariNo)} />
          <DetailField label="Line items" value={String(lineCount)} />
          <DetailField label="Tafseel" value={recordString(record.tafseel)} />
          <DetailField label="Notes" value={recordString(record.notes)} />
        </>
      ) : null}

      {kind === 'account-adjustment' ? (
        <>
          <DetailField
            label="Account"
            value={
              adjustmentAccount
                ? `${adjustmentAccount.name} (${adjustmentAccount.code})`
                : '—'
            }
          />
          <DetailField label="Date" value={formatDate(String(record.adjustmentDate ?? ''))} />
          <DetailField label="Amount" value={formatLedgerAmount(String(record.amount ?? 0))} />
          <DetailField label="Side" value={recordString(record.side)} />
          <DetailField label="Notes" value={recordString(record.notes)} />
        </>
      ) : null}

      {kind === 'stock-adjustment' ? (
        <>
          <DetailField
            label="Product"
            value={
              adjustmentProduct
                ? `${adjustmentProduct.name} (${adjustmentProduct.code})`
                : '—'
            }
          />
          <DetailField label="Bag type" value={recordString(record.bagType)} />
          <DetailField label="Direction" value={recordString(record.direction)} />
          <DetailField label="Bags" value={recordString(record.bags)} />
          <DetailField label="Ledger amount" value={formatLedgerAmount(String(record.amount ?? 0))} />
          <DetailField label="Date" value={formatDate(String(record.adjustmentDate ?? ''))} />
          <DetailField label="Notes" value={recordString(record.notes)} />
        </>
      ) : null}

      {canEdit ? (
        <form className="mt-6 border-t border-border pt-4" onSubmit={onSaveEdit}>
          <h3 className="mb-3 text-sm font-semibold text-textPrimary">Edit pending record</h3>
          {kind === 'account' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Name</FieldLabel>
                <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div>
                <FieldLabel>Opening balance</FieldLabel>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={editObAmount}
                  onChange={(e) => setEditObAmount(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Balance side</FieldLabel>
                <select
                  className="app-input"
                  value={editObSide}
                  onChange={(e) => setEditObSide(e.target.value as 'DR' | 'CR')}
                >
                  <option value="DR">Debit (DR)</option>
                  <option value="CR">Credit (CR)</option>
                </select>
              </div>
            </div>
          ) : null}

          {kind === 'product' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Name</FieldLabel>
                <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div>
                <FieldLabel>Unit</FieldLabel>
                <TextInput value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
              </div>
            </div>
          ) : null}

          {kind === 'voucher' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Date</FieldLabel>
                <TextInput type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Amount</FieldLabel>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Reference</FieldLabel>
                <TextInput value={editReference} onChange={(e) => setEditReference(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <TextInput value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
            </div>
          ) : null}

          {kind === 'invoice' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Invoice date</FieldLabel>
                <TextInput
                  type="date"
                  value={editInvoiceDate}
                  onChange={(e) => setEditInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Bill no.</FieldLabel>
                <TextInput value={editBillNo} onChange={(e) => setEditBillNo(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Gari no.</FieldLabel>
                <TextInput value={editGariNo} onChange={(e) => setEditGariNo(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Tafseel</FieldLabel>
                <TextInput value={editTafseel} onChange={(e) => setEditTafseel(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
            </div>
          ) : null}

          {kind === 'account-adjustment' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Date</FieldLabel>
                <TextInput type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Amount</FieldLabel>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Side</FieldLabel>
                <select
                  className="app-input"
                  value={editObSide}
                  onChange={(e) => setEditObSide(e.target.value as 'DR' | 'CR')}
                >
                  <option value="DR">Debit (DR)</option>
                  <option value="CR">Credit (CR)</option>
                </select>
              </div>
              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
            </div>
          ) : null}

          {kind === 'stock-adjustment' ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>Bag type</FieldLabel>
                <select
                  className="app-input"
                  value={editBagType}
                  onChange={(e) => setEditBagType(e.target.value as 'BORI' | 'THELA')}
                >
                  <option value="BORI">Bori</option>
                  <option value="THELA">Thela</option>
                </select>
              </div>
              <div>
                <FieldLabel>Direction</FieldLabel>
                <select
                  className="app-input"
                  value={editDirection}
                  onChange={(e) => setEditDirection(e.target.value as 'IN' | 'OUT')}
                >
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                </select>
              </div>
              <div>
                <FieldLabel>Bags</FieldLabel>
                <TextInput
                  type="number"
                  min="0.01"
                  step="1"
                  value={editBags}
                  onChange={(e) => setEditBags(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Ledger amount</FieldLabel>
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <TextInput type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      {!isAdmin ? (
        <p className="mt-4 text-sm text-textMuted">
          Only an administrator can approve or reject pending records.
        </p>
      ) : null}
    </Panel>
  );
}

export function PendingApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | ApprovalKind>('all');
  const [selected, setSelected] = useState<{ kind: ApprovalKind; id: number } | null>(null);
  const [detail, setDetail] = useState<PendingApprovalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api.listPendingApprovals();
      setItems(rows);
      notifyApprovalsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending approvals');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (kind: ApprovalKind, id: number) => {
    setDetailLoading(true);
    setError('');
    try {
      const row = await api.getPendingApprovalDetail(kind, id);
      setDetail(row);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Failed to load record detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    void loadDetail(selected.kind, selected.id);
  }, [selected, loadDetail]);

  const filteredItems = useMemo(
    () => (kindFilter === 'all' ? items : items.filter((row) => row.kind === kindFilter)),
    [items, kindFilter],
  );

  const selectedItem = useMemo(
    () =>
      selected
        ? items.find((row) => row.kind === selected.kind && row.id === selected.id) ?? null
        : null,
    [items, selected],
  );

  const canEditSelected =
    isAdmin ||
    (selectedItem?.createdBy?.id != null && selectedItem.createdBy.id === user?.id) ||
    (detail != null && recordCreatedById(detail.record) === user?.id);

  async function onApproveSelected() {
    if (!selected) return;
    await api.approvePendingRecord(selected.kind, selected.id);
    setSelected(null);
    setDetail(null);
    await loadList();
    notifyApprovalsChanged();
  }

  async function onRejectSelected() {
    if (!selected) return;
    await api.rejectPendingRecord(selected.kind, selected.id);
    setSelected(null);
    setDetail(null);
    await loadList();
    notifyApprovalsChanged();
  }

  async function onDetailSaved() {
    if (!selected) return;
    await Promise.all([loadList(), loadDetail(selected.kind, selected.id)]);
    notifyApprovalsChanged();
  }

  return (
    <PageShell
      title="Pending Approvals"
      subtitle={
        isAdmin
          ? 'Review, edit, approve, or reject records awaiting administrator approval'
          : 'View pending records you submitted — an administrator must approve them'
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((filter) => (
          <SecondaryButton
            key={filter.value}
            type="button"
            className={kindFilter === filter.value ? 'ring-2 ring-accent' : ''}
            onClick={() => setKindFilter(filter.value)}
          >
            {filter.label}
            {filter.value === 'all'
              ? ` (${items.length})`
              : ` (${items.filter((row) => row.kind === filter.value).length})`}
          </SecondaryButton>
        ))}
        <SecondaryButton type="button" className="ml-auto" onClick={() => void loadList()}>
          Refresh
        </SecondaryButton>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-textPrimary">
            Queue ({filteredItems.length})
          </h2>
          {loading ? (
            <p className="text-sm text-textMuted">Loading…</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-textMuted">No pending approvals.</p>
          ) : (
            <LegacyTable>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th>Submitted by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const isSelected = selected?.kind === row.kind && selected.id === row.id;
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className={`cursor-pointer ${isSelected ? 'bg-surface1' : ''}`}
                      onClick={() => setSelected({ kind: row.kind, id: row.id })}
                    >
                      <td>{KIND_LABELS[row.kind]}</td>
                      <td>
                        <div className="font-medium">{row.label}</div>
                        {row.sublabel ? (
                          <div className="text-xs text-textMuted">{row.sublabel}</div>
                        ) : null}
                      </td>
                      <td className="text-right">
                        {row.amount != null ? formatLedgerAmount(row.amount) : '—'}
                      </td>
                      <td>{row.createdBy?.displayName ?? row.createdBy?.username ?? '—'}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </LegacyTable>
          )}
        </Panel>

        {selected ? (
          detailLoading ? (
            <Panel>
              <p className="text-sm text-textMuted">Loading detail…</p>
            </Panel>
          ) : detail ? (
            <ApprovalDetailPanel
              detail={detail}
              isAdmin={isAdmin}
              canEdit={canEditSelected}
              onApprove={onApproveSelected}
              onReject={onRejectSelected}
              onSaved={onDetailSaved}
            />
          ) : null
        ) : (
          <Panel>
            <p className="text-sm text-textMuted">Select a row to view details and take action.</p>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
