export type NavLink = {
  label: string;
  to: string;
  description?: string;
};

export type NavItem =
  | ({ kind: 'link' } & NavLink)
  | { kind: 'submenu'; label: string; children: NavLink[] };

export type NavGroup = {
  label: string;
  children?: NavItem[];
  to?: string;
};

export const TOP_NAV: NavGroup[] = [
  {
    label: 'Accounts',
    children: [
      {
        kind: 'submenu',
        label: 'Category',
        children: [
          { label: 'Add Category', to: '/accounts/categories/add' },
          { label: 'Edit Category', to: '/accounts/categories/edit' },
          { label: 'Remove Category', to: '/accounts/categories/remove' },
        ],
      },
      {
        kind: 'submenu',
        label: 'Account',
        children: [
          { label: 'Add Account', to: '/accounts/manage/add' },
          { label: 'Edit Account', to: '/accounts/manage/edit' },
          { label: 'Remove Account', to: '/accounts/manage/remove' },
        ],
      },
      {
        kind: 'submenu',
        label: 'Product',
        children: [
          { label: 'Add Product', to: '/accounts/products/add', description: 'Auto-creates product ledger' },
          { label: 'Remove Product', to: '/accounts/products/remove' },
        ],
      },
      { kind: 'link', label: 'Sale Party', to: '/accounts/sale-parties' },
      { kind: 'link', label: 'Purchase Party', to: '/accounts/purchase-parties' },
    ],
  },
  {
    label: 'Sale/Purchase Invoice',
    children: [
      { kind: 'link', label: 'Sale on Commission', to: '/invoices/sale-commission' },
      { kind: 'link', label: 'Sale on Paunch', to: '/invoices/sale-paunch' },
      { kind: 'link', label: 'Purchase to Maal', to: '/invoices/purchase-maal' },
      { kind: 'link', label: 'Kachi Maal', to: '/invoices/kachi-maal' },
      { kind: 'link', label: 'View Previous Bill', to: '/invoices/history' },
    ],
  },
  {
    label: 'Inventory Stock',
    children: [{ kind: 'link', label: 'Bardana', to: '/inventory/bardana' }],
  },
  {
    label: 'Voucher',
    children: [
      { kind: 'link', label: 'Payment Voucher', to: '/vouchers/payment' },
      { kind: 'link', label: 'Journal Voucher', to: '/vouchers/journal' },
      { kind: 'link', label: 'Receipt Voucher', to: '/vouchers/receipt' },
      { kind: 'link', label: 'View Voucher', to: '/vouchers/view' },
    ],
  },
  {
    label: 'Reports',
    children: [
      {
        kind: 'submenu',
        label: 'Account Reports',
        children: [
          { label: 'Account Ledger', to: '/reports/accounts' },
          { label: 'Account Balance', to: '/reports/account-balance' },
          { label: 'Vouchers', to: '/reports/vouchers' },
        ],
      },
      { kind: 'link', label: 'Detail Trial Balance', to: '/reports/trial-balance' },
      { kind: 'link', label: 'Sale/Purchase Reports', to: '/reports/sale-purchase' },
    ],
  },
  {
    label: 'System',
    children: [{ kind: 'link', label: 'System Preference', to: '/system/preferences' }],
  },
  {
    label: 'User',
    to: '/user',
  },
];

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  SALE_COMMISSION: 'Sale on Commission',
  SALE_PAUNCH: 'Sale on Paunch',
  PURCHASE_MAAL: 'Purchase to Maal',
  KACHI_MAAL: 'Kachi Maal',
};
