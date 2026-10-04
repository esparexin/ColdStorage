'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaymentStatus, RentSummaryDto } from '@cold-storage/contracts';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import type { GrnListItem } from '../types';

export const RENT_PAGE_SIZE = 20;

export function useRentData() {
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [rentSummaries, setRentSummaries] = useState<RentSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTermRaw] = useState('');

  // Search and status narrow the client-side set, so page 1 is the only valid page.
  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  }, []);
  const [statusFilter, setStatusFilterRaw] = useState<'' | PaymentStatus>('');

  const setStatusFilter = useCallback((v: '' | PaymentStatus) => {
    setStatusFilterRaw(v);
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
    try {
      const grnRes = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?limit=100`,
      );
      if (!grnRes.ok) {
        const err = (await grnRes.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${grnRes.status}`);
      }
      const grnData = (await grnRes.json()) as { items?: GrnListItem[] };
      const grns = grnData.items ?? [];

      const summaries: RentSummaryDto[] = [];
      const results = await Promise.allSettled(
        grns.map(async (g) => {
          const res = await requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/grn/${encodeURIComponent(g.id)}`,
          );
          if (res.ok) {
            return (await res.json()) as RentSummaryDto;
          }
          return null;
        }),
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          summaries.push(res.value);
        }
      }

      setRentSummaries(summaries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rent billing accounts');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchRentAccounts();
  }, [fetchRentAccounts]);

  const filteredAccounts = useMemo(() => {
    return rentSummaries.filter((acc) => {
      const matchSearch =
        !searchTerm.trim() ||
        acc.grnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.commodityName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = !statusFilter || acc.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rentSummaries, searchTerm, statusFilter]);

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
