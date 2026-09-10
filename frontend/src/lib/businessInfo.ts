import { api, type SystemPreferences } from './api';
import type { ReportBusinessInfo } from './reportExport';

/** Fallback when prefs have not loaded yet — matches seeded System Preference defaults. */
export const DEFAULT_BUSINESS_INFO: ReportBusinessInfo = {
  businessName: 'Sufi & Co.',
  proprietorName: 'Sufi M.Saleem Ullah',
  phone: '0632501213',
  mobile: '03006982486',
  email: 'sufisaleemullah@gmail.com',
  ntnNumber: null,
};

export function businessInfoFromPrefs(
  prefs: Pick<
    SystemPreferences,
    'businessName' | 'proprietorName' | 'phone' | 'mobile' | 'email' | 'ntnNumber'
  >,
): ReportBusinessInfo {
  return {
    businessName: prefs.businessName?.trim() || DEFAULT_BUSINESS_INFO.businessName,
    proprietorName: prefs.proprietorName?.trim() || DEFAULT_BUSINESS_INFO.proprietorName,
    phone: prefs.phone?.trim() || DEFAULT_BUSINESS_INFO.phone,
    mobile: prefs.mobile,
    email: prefs.email,
    ntnNumber: prefs.ntnNumber,
  };
}

export async function loadBusinessInfo(): Promise<ReportBusinessInfo> {
  try {
    const prefs = await api.getSystemPreferences();
    return businessInfoFromPrefs(prefs);
  } catch {
    return { ...DEFAULT_BUSINESS_INFO };
  }
}
