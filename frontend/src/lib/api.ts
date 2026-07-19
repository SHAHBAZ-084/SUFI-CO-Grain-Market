export type User = {
  id: number;
  username: string;
  displayName: string;
};

export type AccountCategory = {
  id: number;
  name: string;
  isActive: boolean;
};

export type Product = {
  id: number;
  name: string;
  code: string;
  unit: string | null;
  accountId: number;
};

export type Party = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  balance?: number | string;
};

export type Invoice = {
  id: number;
  type: string;
  status: string;
  reference: string;
  total: number | string;
  createdAt: string;
  customer?: Party | null;
  supplier?: Party | null;
};

export type Voucher = {
  id: number;
  type: string;
  number: number;
  amount: number | string;
  description?: string | null;
  reference?: string | null;
  status: string;
  createdAt: string;
};

type ApiError = { error: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export const api = {
  login(username: string, password: string) {
    return request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<{ user: User }>('/api/auth/me');
  },

  listCategories() {
    return request<AccountCategory[]>('/api/accounting/categories');
  },
  createCategory(name: string) {
    return request<AccountCategory>('/api/accounting/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  deleteCategory(id: number) {
    return request<AccountCategory>(`/api/accounting/categories/${id}`, { method: 'DELETE' });
  },

  listProducts() {
    return request<Product[]>('/api/products');
  },
  createProduct(data: { name: string; unit?: string; code?: string }) {
    return request<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) });
  },
  removeProduct(id: number) {
    return request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' });
  },

  listSaleParties() {
    return request<Party[]>('/api/parties/sale-parties');
  },
  createSaleParty(data: Record<string, string | undefined>) {
    return request<Party>('/api/parties/sale-parties', { method: 'POST', body: JSON.stringify(data) });
  },
  removeSaleParty(id: number) {
    return request<Party>(`/api/parties/sale-parties/${id}`, { method: 'DELETE' });
  },

  listPurchaseParties() {
    return request<Party[]>('/api/parties/purchase-parties');
  },
  createPurchaseParty(data: Record<string, string | undefined>) {
    return request<Party>('/api/parties/purchase-parties', { method: 'POST', body: JSON.stringify(data) });
  },
  removePurchaseParty(id: number) {
    return request<Party>(`/api/parties/purchase-parties/${id}`, { method: 'DELETE' });
  },

  listInvoices(type?: string) {
    const query = type ? `?type=${type}` : '';
    return request<Invoice[]>(`/api/invoices${query}`);
  },

  listVouchers() {
    return request<Voucher[]>('/api/accounting/vouchers');
  },
  createVoucher(data: {
    type: string;
    debitAccountId: number;
    creditAccountId: number;
    amount: number;
    description?: string;
    reference?: string;
  }) {
    return request<Voucher>('/api/accounting/vouchers', { method: 'POST', body: JSON.stringify(data) });
  },

  listAccounts() {
    return request<{ id: number; name: string; code: string }[]>('/api/accounting/accounts');
  },

  getTrialBalance() {
    return request<{
      accounts: { accountName: string; debit: number; credit: number }[];
      totalDebit: number;
      totalCredit: number;
      isBalanced: boolean;
    }>('/api/accounting/trial-balance');
  },

  listBardana() {
    return request<{ id: number; name: string; quantity: number | string; unit: string }[]>('/api/inventory/bardana');
  },
  createBardana(data: { name: string; quantity?: number; unit?: string; notes?: string }) {
    return request('/api/inventory/bardana', { method: 'POST', body: JSON.stringify(data) });
  },
};
