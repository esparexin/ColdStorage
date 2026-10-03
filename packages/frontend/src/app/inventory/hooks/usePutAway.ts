import { useCallback, useEffect, useState } from 'react';
import type { GrnInventorySummary, PutAwayAllocation } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

/**
 * Put-away confirms that a GRN's outstanding bags are on hand in the chamber recorded on that
 * GRN. There is no position picker and no per-row bag breakdown: allocation is whole-lot, so
 * the backend allocates whatever remains unallocated.
 */
export function usePutAway(
  selectedFacilityId: string | null,
  initialGrnId: string | null,
  onAllocationSuccess?: () => void,
) {
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(initialGrnId);
  const [grnSummary, setGrnSummary] = useState<GrnInventorySummary | null>(null);
  const [pastAllocations, setPastAllocations] = useState<PutAwayAllocation[]>([]);
  const [loadingGrnDetails, setLoadingGrnDetails] = useState(false);
  const [allocNotes, setAllocNotes] = useState('');
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [rentBlocked, setRentBlocked] = useState<{
    grnId: string;
    grnNumber: string;
    rentAmount: number;
    totalPaid: number;
    remainingBalance: number;
  } | null>(null);

  const clearRentBlock = useCallback(() => {
    setRentBlocked(null);
  }, []);

  const fetchGrnSummaryAndHistory = useCallback(
    async (grnId: string) => {
      if (!selectedFacilityId || !grnId) return;
      setLoadingGrnDetails(true);
      setAllocError(null);
      setRentBlocked(null);
      try {
        const [sumRes, allocRes] = await Promise.all([
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/inventory-summary`,
          ),
          requestWithAuth(
            `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grnId)}/allocations`,
          ),
        ]);

        if (sumRes.ok) {
          const data = (await sumRes.json()) as { summary: GrnInventorySummary };
          setGrnSummary(data.summary);
        }

        if (allocRes.ok) {
          const allocData = (await allocRes.json()) as { allocations?: PutAwayAllocation[] };
          setPastAllocations(allocData.allocations ?? []);
        }
      } catch (err: unknown) {
        setAllocError(err instanceof Error ? err.message : 'Failed to load GRN inventory details');
      } finally {
        setLoadingGrnDetails(false);
      }
    },
    [selectedFacilityId],
  );

  useEffect(() => {
    if (selectedGrnId) {
      void fetchGrnSummaryAndHistory(selectedGrnId);
    }
  }, [selectedGrnId, fetchGrnSummaryAndHistory]);

  const handlePutAwaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedGrnId || !grnSummary) return;

    if (grnSummary.unallocatedBags <= 0) {
      setAllocError(`GRN ${grnSummary.grnNumber} is already fully allocated`);
      return;
    }

    setAllocSubmitting(true);
    setAllocError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(selectedGrnId)}/allocations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: allocNotes.trim() || undefined }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string;
          code?: string;
          rent?: {
            grnId: string;
            grnNumber: string;
            rentAmount: number;
            totalPaid: number;
            remainingBalance: number;
          };
        };
        if (res.status === 402 && data.code === 'RENT_PAYMENT_REQUIRED' && data.rent) {
          setRentBlocked(data.rent);
        }
        throw new Error(data.error ?? `Put-away failed with HTTP ${res.status}`);
      }

      setRentBlocked(null);
      setAllocNotes('');
      void fetchGrnSummaryAndHistory(selectedGrnId);
      if (onAllocationSuccess) onAllocationSuccess();
    } catch (err: unknown) {
      setAllocError(err instanceof Error ? err.message : 'Put-away allocation failed');
    } finally {
      setAllocSubmitting(false);
    }
  };

  return {
    selectedGrnId,
    setSelectedGrnId,
    grnSummary,
    pastAllocations,
    loadingGrnDetails,
    allocNotes,
    setAllocNotes,
    allocSubmitting,
    allocError,
    rentBlocked,
    clearRentBlock,
    handlePutAwaySubmit,
    fetchGrnSummaryAndHistory,
  };
}
