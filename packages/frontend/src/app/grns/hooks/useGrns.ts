import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Commodity,
  Customer,
  Grn,
} from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';
import { cachedRequestWithAuth } from '@/lib/api-cache';

import {
  type GrnProfileTab,
  type GrnStatusTab,
  VALID_GRN_TABS,
  resolveInitialGrnTab,
  syncGrnTabToLocation,
} from './grnTabPersistence.helper';

export type { GrnProfileTab, GrnStatusTab };

export const GRN_PAGE_SIZE = 20;

export interface GrnTabCounts {
  all: number;
  active: number;
  partial: number;
  pendingPayment: number;
  closed: number;
  merged: number;
}

export function useGrns(
  selectedFacilityId: string | null,
  availableFacilities: Array<{ id: string; name: string }>,
) {
  const [grns, setGrns] = useState<Grn[]>([]);
  const [totalGrns, setTotalGrns] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  // Tab counts
  const [tabCounts, setTabCounts] = useState<GrnTabCounts>({
    all: 0,
    active: 0,
    partial: 0,
    pendingPayment: 0,
    closed: 0,
    merged: 0,
  });

  // Lookups
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);

  // Filter states
  const [searchTerm, setSearchTermRaw] = useState('');
  const [statusFilter, setStatusFilterRaw] = useState<GrnProfileTab>(() => resolveInitialGrnTab());
  const [customerFilter, setCustomerFilterRaw] = useState('');
  const [commodityFilter, setCommodityFilterRaw] = useState('');

  // Server-side filters narrow the result set, so the current page number is
  // reset to 1 whenever a filter or search term changes.
  const setSearchTerm = useCallback((v: string) => { setSearchTermRaw(v); setPage(1); }, []);
  const setStatusFilter = useCallback((v: GrnProfileTab) => {
    setStatusFilterRaw(v);
    setPage(1);
    syncGrnTabToLocation(v);
  }, []);
  const setCustomerFilter = useCallback((v: string) => { setCustomerFilterRaw(v); setPage(1); }, []);
  const setCommodityFilter = useCallback((v: string) => { setCommodityFilterRaw(v); setPage(1); }, []);

  // Fetch Lookups
  const fetchLookups = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const [custRes, commRes] = await Promise.all([
        cachedRequestWithAuth(`/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`),
        cachedRequestWithAuth('/api/commodities'),
      ]);

      if (custRes.ok) {
        const data = (await custRes.json()) as { items?: Customer[] };
        setCustomers((data.items ?? []).filter((c) => c.isActive));
      }
      if (commRes.ok) {
        const data = (await commRes.json()) as { items?: Commodity[] };
        setCommodities((data.items ?? []).filter((c) => c.isActive));
      }
    } catch {
      // Lookups fail gracefully without halting UI
    }
  }, [selectedFacilityId]);

  // Fetch GRNs
  const fetchGrns = useCallback(async () => {
    if (!selectedFacilityId) {
      setGrns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(GRN_PAGE_SIZE));
      if (statusFilter) {
        params.set('tab', statusFilter);
      }
      if (customerFilter) params.set('customerId', customerFilter);
      if (commodityFilter) params.set('commodityId', commodityFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        items?: Grn[];
        total?: number;
        counts?: GrnTabCounts;
      };
      if (!isCurrent()) return;
      setGrns(data.items ?? []);
      setTotalGrns(data.total ?? 0);
      setTotalPages(Math.ceil((data.total ?? 0) / GRN_PAGE_SIZE));
      if (data.counts) {
        setTabCounts(data.counts);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load Inward of Goods');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [selectedFacilityId, page, statusFilter, customerFilter, commodityFilter, searchTerm]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    void fetchGrns();
  }, [fetchGrns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const urlTab = url.searchParams.get('tab') || url.searchParams.get('status');
      if (statusFilter && !urlTab) {
        url.searchParams.set('tab', statusFilter.toLowerCase());
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // ignore
    }
  }, [statusFilter]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = (params.get('tab') || params.get('status'))?.trim().toUpperCase();
      if (tabParam && tabParam in VALID_GRN_TABS) {
        setStatusFilterRaw(VALID_GRN_TABS[tabParam]);
        setPage(1);
      } else if (!tabParam) {
        setStatusFilterRaw('');
        setPage(1);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const resetFilters = () => {
    setStatusFilter('');
    setCustomerFilter('');
    setCommodityFilter('');
    setSearchTerm('');
  };

  return {
    grns,
    filteredGrns: grns,
    totalGrns,
    totalPages,
    tabCounts,
    page,
    setPage,
    pageSize: GRN_PAGE_SIZE,
    loading,
    error,
    customers,
    commodities,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    customerFilter,
    setCustomerFilter,
    commodityFilter,
    setCommodityFilter,
    currentFacilityName,
    fetchGrns,
    fetchLookups,
    resetFilters,
  };
}
