export function formatLedgerAmount(amount: number | string) {
  return Number(amount).toLocaleString('en-PK');
}

/** Running balance: positive = Dr, negative = Cr (never show negative Dr). */
export function formatLedgerBalance(balance: number | string) {
  const n = Number(balance);
  const abs = Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `${abs} Dr` : `${abs} Cr`;
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}
