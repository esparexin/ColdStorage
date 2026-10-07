import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryChallan, DeliveryStatus } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';
import { filterDeliveries, type DeliveryRentStatusFilter } from './deliveryFilter.helper';

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
  const [statusFilter, setStatusFilterRaw] = useState<'' | DeliveryStatus>('');
  const [rentStatusFilter, setRentStatusFilterRaw] = useState<DeliveryRentStatusFilter>('');

  // Narrowing a filter resets pagination to page 1.
  const setSearchTerm = useCallback((v: string) => { setSearchTermRaw(v); setPage(1); }, []);
  const setStatusFilter = useCallback((v: '' | DeliveryStatus) => { setStatusFilterRaw(v); setPage(1); }, []);
  const setRentStatusFilter = useCallback((v: DeliveryRentStatusFilter) => { setRentStatusFilterRaw(v); setPage(1); }, []);

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
      if (statusFilter) params.set('status', statusFilter);

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
  }, [selectedFacilityId, page, statusFilter]);

  useEffect(() => {
    void fetchDeliveries();
  }, [fetchDeliveries]);

  const filteredDeliveries = useMemo(() => {
    return filterDeliveries(deliveries, searchTerm, rentStatusFilter);
  }, [deliveries, searchTerm, rentStatusFilter]);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const resetFilters = () => {
    setStatusFilter('');
    setRentStatusFilter('');
    setSearchTerm('');
  };

  return {
    deliveries,
    filteredDeliveries,
    totalDeliveries,
    totalPages,
    page,
    setPage,
    pageSize: DELIVERY_PAGE_SIZE,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    rentStatusFilter,
    setRentStatusFilter,
    currentFacilityName,
    fetchDeliveries,
    resetFilters,
  };
}
