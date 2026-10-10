'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { useFacility } from '@/context/FacilityContext';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';
import {
  filterRentAccounts,
  type RentStatusFilter,
  type RentTypeFilter,
} from './rentFilter.helper';

export const RENT_PAGE_SIZE = 20;

export function useRentData() {
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [rentSummaries, setRentSummaries] = useState<RentSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTermRaw] = useState('');

  // Search and status narrow the client-side set, so page 1 is the only valid page.
  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  }, []);
  const [statusFilter, setStatusFilterRaw] = useState<RentStatusFilter>('');

  const setStatusFilter = useCallback((v: RentStatusFilter) => {
    setStatusFilterRaw(v);
    setPage(1);
  }, []);

  const [typeFilter, setTypeFilterRaw] = useState<RentTypeFilter>('');

  const setTypeFilter = useCallback((v: RentTypeFilter) => {
    setTypeFilterRaw(v);
    setPage(1);
  }, []);

  const fetchRentAccounts = useCallback(async () => {
    if (!selectedFacilityId) {
      setRentSummaries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      // One request for the whole facility. This used to fetch the GRN list and
      // then call /rent/grn/:id once per GRN, which cost ~100 requests and
      // roughly 400 MongoDB round trips per page view.
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/summaries`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { summaries?: RentSummaryDto[] };
            if (!isCurrent()) return;
setRentSummaries(data.summaries ?? []);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load rent billing accounts');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchRentAccounts();
  }, [fetchRentAccounts]);

  const filteredAccounts = useMemo(() => {
    return filterRentAccounts(rentSummaries, {
      searchTerm,
      statusFilter,
      typeFilter,
    });
  }, [rentSummaries, searchTerm, statusFilter, typeFilter]);

  // Derived from the filtered set so the totals always describe exactly the
  // rows in the table below them, rather than the unfiltered facility totals.
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    for (const acc of filteredAccounts) {
      totalBilled += acc.rentAmount;
      totalCollected += acc.totalPaid;
      totalOutstanding += acc.remainingBalance;
    }

    return { totalBilled, totalCollected, totalOutstanding };
  }, [filteredAccounts]);

  const totalPages = Math.ceil(filteredAccounts.length / RENT_PAGE_SIZE);

  const pagedAccounts = filteredAccounts.slice(
    (page - 1) * RENT_PAGE_SIZE,
    page * RENT_PAGE_SIZE,
  );

  const currentFacilityName = useMemo(() => {
    return availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? selectedFacilityId;
  }, [availableFacilities, selectedFacilityId]);

  return {
    selectedFacilityId,
    currentFacilityName,
    rentSummaries,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    metrics,
    filteredAccounts,
    pagedAccounts,
    totalAccounts: filteredAccounts.length,
    totalPages,
    page,
    setPage,
    pageSize: RENT_PAGE_SIZE,
    fetchRentAccounts,
  };
}
