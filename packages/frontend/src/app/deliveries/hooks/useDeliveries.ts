import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';
import {
  filterDeliveries,
  type DeliveryRentStatusFilter,
  type DeliveryStatusTab,
} from './deliveryFilter.helper';
import {
  VALID_DELIVERY_STATUS_TABS,
  resolveInitialDeliveryStatusTab,
  syncDeliveryStatusTabToLocation,
} from './deliveryTabPersistence.helper';

export const DELIVERY_PAGE_SIZE = 20;

export function useDeliveries(
  selectedFacilityId: string | null,
  availableFacilities: Array<{ id: string; name: string }>,
) {
  const [deliveries, setDeliveries] = useState<DeliveryChallan[]>([]);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTermRaw] = useState('');
  const [statusTab, setStatusTabRaw] = useState<DeliveryStatusTab>(() =>
    resolveInitialDeliveryStatusTab(),
  );
  const [rentStatusFilter, setRentStatusFilterRaw] = useState<DeliveryRentStatusFilter>('');

  // Narrowing a filter resets pagination to page 1.
  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  }, []);

  const setStatusTab = useCallback((v: DeliveryStatusTab) => {
    setStatusTabRaw(v);
    setPage(1);
    syncDeliveryStatusTabToLocation(v);
  }, []);

  const setRentStatusFilter = useCallback((v: DeliveryRentStatusFilter) => {
    setRentStatusFilterRaw(v);
    setPage(1);
  }, []);

  const fetchDeliveries = useCallback(async () => {
    if (!selectedFacilityId) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(DELIVERY_PAGE_SIZE));

      // For active, unsettled, or partially paid tabs, fetch ISSUED from server.
      if (statusTab === 'ACTIVE' || statusTab === 'UNSETTLED' || statusTab === 'PARTIAL' || statusTab === 'CLOSED') {
        params.set('status', 'ISSUED');
      }

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/deliveries?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: DeliveryChallan[]; total?: number };
      if (!isCurrent()) return;
      setDeliveries(data.items ?? []);
      setTotalDeliveries(data.total ?? 0);
      setTotalPages(Math.ceil((data.total ?? 0) / DELIVERY_PAGE_SIZE));
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [selectedFacilityId, page, statusTab, beginRequest]);

  useEffect(() => {
    void fetchDeliveries();
  }, [fetchDeliveries]);

  // Sync tab with browser URL history popstate
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = (params.get('tab') || params.get('status'))?.trim().toUpperCase();
      if (tabParam && tabParam in VALID_DELIVERY_STATUS_TABS) {
        setStatusTabRaw(VALID_DELIVERY_STATUS_TABS[tabParam]);
        setPage(1);
      } else if (!tabParam) {
        setStatusTabRaw('ACTIVE');
        setPage(1);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const filteredDeliveries = useMemo(() => {
    return filterDeliveries(deliveries, searchTerm, rentStatusFilter, statusTab);
  }, [deliveries, searchTerm, rentStatusFilter, statusTab]);

  const hasActiveFilters = Boolean(
    statusTab !== '' || rentStatusFilter !== '' || searchTerm.trim() !== '',
  );

  const displayTotalDeliveries = useMemo(() => {
    if (hasActiveFilters) {
      return filteredDeliveries.length;
    }
    return totalDeliveries;
  }, [filteredDeliveries.length, hasActiveFilters, totalDeliveries]);

  const displayTotalPages = useMemo(() => {
    if (hasActiveFilters) {
      return Math.max(1, Math.ceil(filteredDeliveries.length / DELIVERY_PAGE_SIZE));
    }
    return totalPages;
  }, [filteredDeliveries.length, hasActiveFilters, totalPages]);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const resetFilters = useCallback(() => {
    setStatusTab('ACTIVE');
    setRentStatusFilter('');
    setSearchTerm('');
  }, [setStatusTab, setRentStatusFilter, setSearchTerm]);

  return {
    deliveries,
    filteredDeliveries,
    totalDeliveries: displayTotalDeliveries,
    totalPages: displayTotalPages,
    page,
    setPage,
    pageSize: DELIVERY_PAGE_SIZE,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusTab,
    setStatusTab,
    rentStatusFilter,
    setRentStatusFilter,
    currentFacilityName,
    fetchDeliveries,
    resetFilters,
  };
}
