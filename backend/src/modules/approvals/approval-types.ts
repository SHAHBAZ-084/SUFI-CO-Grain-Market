export const APPROVAL_KINDS = [
  'account',
  'product',
  'voucher',
  'invoice',
  'account-adjustment',
  'stock-adjustment',
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export type PendingApprovalItem = {
  kind: ApprovalKind;
  id: number;
  label: string;
  sublabel?: string | null;
  amount?: number | null;
  reference?: string | null;
  recordType?: string | null;
  createdAt: string;
  createdBy?: {
    id: number;
    displayName: string;
    username: string;
  } | null;
};

export function parseApprovalKind(value: string): ApprovalKind {
  if ((APPROVAL_KINDS as readonly string[]).includes(value)) {
    return value as ApprovalKind;
  }
  throw new Error(`Invalid approval type: ${value}`);
}
