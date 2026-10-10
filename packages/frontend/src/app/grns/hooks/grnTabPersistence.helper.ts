export type GrnStatusTab = '' | 'OPEN' | 'CLOSED' | 'MERGED';

export const VALID_GRN_TABS: Record<string, GrnStatusTab> = {
  '': '',
  'ALL': '',
  'OPEN': 'OPEN',
  'CLOSED': 'CLOSED',
  'MERGED': 'MERGED',
};

export function resolveInitialGrnTab(search?: string, storedTab?: string | null): GrnStatusTab {
  try {
    const params = new URLSearchParams(
      search ?? (typeof window !== 'undefined' ? window.location.search : ''),
    );
    const tabParam = (params.get('tab') || params.get('status'))?.trim().toUpperCase();
    if (tabParam && tabParam in VALID_GRN_TABS) {
      return VALID_GRN_TABS[tabParam];
    }
    const stored = (
      storedTab ?? (typeof window !== 'undefined' ? sessionStorage.getItem('grn_active_tab') : null)
    )?.trim().toUpperCase();
    if (stored && stored in VALID_GRN_TABS) {
      return VALID_GRN_TABS[stored];
    }
  } catch {
    // Graceful fallback
  }
  return '';
}

export function syncGrnTabToLocation(tab: GrnStatusTab): void {
  if (typeof window === 'undefined') return;
  try {
    if (tab) {
      sessionStorage.setItem('grn_active_tab', tab);
    } else {
      sessionStorage.removeItem('grn_active_tab');
    }
    const url = new URL(window.location.href);
    if (tab) {
      url.searchParams.set('tab', tab.toLowerCase());
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Graceful fallback
  }
}
