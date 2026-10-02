import { useCallback, useEffect, useState } from 'react';
import type { FacilityInventorySummary, Grn } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useInventoryData(selectedFacilityId: string | null) {
  const [stockSummary, setStockSummary] = useState<FacilityInventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [openGrns, setOpenGrns] = useState<Grn[]>([]);

  const fetchStockSummary = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLoadingSummary(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/inventory`,
      );
      if (res.ok) {
        const data = (await res.json()) as { summary: FacilityInventorySummary };
        setStockSummary(data.summary);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedFacilityId]);

  const fetchOpenGrns = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?status=OPEN&limit=100`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Grn[] };
        setOpenGrns(data.items ?? []);
      }
    } catch {
      // Graceful fallback
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchStockSummary();
    void fetchOpenGrns();
  }, [fetchStockSummary, fetchOpenGrns]);

  return {
    stockSummary,
    loadingSummary,
    openGrns,
    fetchStockSummary,
    fetchOpenGrns,
  };
}
