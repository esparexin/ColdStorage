export type DeliveryStatusTab = '' | 'ACTIVE' | 'UNSETTLED' | 'PARTIAL' | 'CLOSED';
export type DeliveryViewTab = 'listing' | 'issue';

export const VALID_DELIVERY_STATUS_TABS: Record<string, DeliveryStatusTab> = {
  '': '',
  'ALL': '',
  'ACTIVE': 'ACTIVE',
  'ISSUED': 'ACTIVE',
  'UNSETTLED': 'UNSETTLED',
  'CLOSED': 'UNSETTLED',
  'PARTIAL': 'PARTIAL',
  'PARTIALLY_PAID': 'PARTIAL',
};

export function resolveInitialDeliveryStatusTab(
  search?: string,
  storedTab?: string | null,
): DeliveryStatusTab {
  try {
    const params = new URLSearchParams(
      search ?? (typeof window !== 'undefined' ? window.location.search : ''),
    );
    const tabParam = (params.get('tab') || params.get('status'))?.trim().toUpperCase();
    if (tabParam && tabParam in VALID_DELIVERY_STATUS_TABS) {
      return VALID_DELIVERY_STATUS_TABS[tabParam];
    }
    const stored = (
      storedTab !== undefined
        ? storedTab
        : typeof window !== 'undefined'
          ? sessionStorage.getItem('delivery_active_tab')
          : null
    )
      ?.trim()
      .toUpperCase();
    if (stored && stored in VALID_DELIVERY_STATUS_TABS) {
      return VALID_DELIVERY_STATUS_TABS[stored];
    }
  } catch {
    // Graceful fallback
  }
  return 'ACTIVE';
}

export function syncDeliveryStatusTabToLocation(tab: DeliveryStatusTab): void {
  if (typeof window === 'undefined') return;
  try {
    if (tab) {
      sessionStorage.setItem('delivery_active_tab', tab);
    } else {
      sessionStorage.removeItem('delivery_active_tab');
    }
  } catch {
    // Graceful fallback for storage
  }

  try {
    const url = new URL(window.location.href, 'http://localhost');
    if (tab === 'UNSETTLED' || tab === 'CLOSED') {
      url.searchParams.set('tab', 'unsettled');
    } else if (tab === 'PARTIAL') {
      url.searchParams.set('tab', 'partial');
    } else if (tab === '') {
      url.searchParams.set('tab', 'all');
    } else {
      url.searchParams.set('tab', 'active');
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // Graceful fallback for history
  }
}
