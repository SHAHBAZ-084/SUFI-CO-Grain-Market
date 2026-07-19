export type NavLink = {
  label: string;
  to: string;
  description?: string;
};

export type NavGroup = {
  label: string;
  children?: NavLink[];
  to?: string;
};

export const TOP_NAV: NavGroup[] = [
  {
    label: 'Accounts',
    children: [
      { label: 'Add Category', to: '/accounts/categories/add' },
      { label: 'Edit Category', to: '/accounts/categories/edit' },
      { label: 'Remove Category', to: '/accounts/categories/remove' },
      { label: 'Add Product', to: '/accounts/products/add', description: 'Auto-creates product ledger' },
      { label: 'Remove Product', to: '/accounts/products/remove' },
      { label: 'Sale Party', to: '/accounts/sale-parties' },
      { label: 'Purchase Party', to: '/accounts/purchase-parties' },
    ],
  },
  {
    label: 'Sale/Purchase Invoice',
    children: [
      { label: 'Sale on Commission', to: '/invoices/sale-commission' },
      { label: 'Sale on Paunch', to: '/invoices/sale-paunch' },
      { label: 'Purchase to Maal', to: '/invoices/purchase-maal' },
      { label: 'Kachi Maal', to: '/invoices/kachi-maal' },
      { label: 'View Previous Bill', to: '/invoices/history' },
    ],
  },
  {
    label: 'Inventory Stock',
    children: [{ label: 'Bardana', to: '/inventory/bardana' }],
  },
  {
    label: 'Voucher',
    children: [
      { label: 'Payment Voucher', to: '/vouchers/payment' },
      { label: 'Journal Voucher', to: '/vouchers/journal' },
      { label: 'Receipt Voucher', to: '/vouchers/receipt' },
      { label: 'View Voucher', to: '/vouchers/view' },
    ],
  },
  {
    label: 'Reports',
    children: [
      { label: 'Account Reports', to: '/reports/accounts' },
      { label: 'Detail Trial Balance', to: '/reports/trial-balance' },
      { label: 'Sale/Purchase Reports', to: '/reports/sale-purchase' },
    ],
  },
  {
    label: 'System',
    children: [{ label: 'System Preference', to: '/system/preferences' }],
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
