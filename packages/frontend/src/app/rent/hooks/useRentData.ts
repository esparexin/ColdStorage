'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaymentStatus, RentSummaryDto } from '@cold-storage/contracts';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import type { GrnListItem } from '../types';

export function useRentData() {
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [rentSummaries, setRentSummaries] = useState<RentSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | PaymentStatus>('');

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

  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    for (const acc of rentSummaries) {
      totalBilled += acc.rentAmount;
      totalCollected += acc.totalPaid;
      totalOutstanding += acc.remainingBalance;
    }

    return { totalBilled, totalCollected, totalOutstanding };
  }, [rentSummaries]);

  const filteredAccounts = useMemo(() => {
    return rentSummaries.filter((acc) => {
      const matchSearch =
        !searchTerm.trim() ||
        acc.grnNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.customerMobile.includes(searchTerm.trim()) ||
        acc.commodityName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = !statusFilter || acc.paymentStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rentSummaries, searchTerm, statusFilter]);

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
    fetchRentAccounts,
  };
}
