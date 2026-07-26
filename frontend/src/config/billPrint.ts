/** Letterhead shown on printable bills — adjust here only. */
export const BILL_LETTERHEAD = {
  companyName: 'Sufi & Co.',
  subtitle: 'Grain Market Chishtian',
  phone: '0632501213',
  mobile: '03006982486',
  email: 'sufisaleemullah@gmail.com',
  proprietor: 'Sufi M.Saleem Ullah',
} as const;

export const BILL_TITLES: Record<string, string> = {
  SALE_COMMISSION: 'Sale Bill',
  SALE_PAUNCH: 'Sale Bill',
  PURCHASE_MAAL: 'Purchase Bill',
  KACHI_MAAL: 'Kachi Maal Bill',
};
