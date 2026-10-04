import { useCallback, useEffect, useState } from 'react';
import type { FacilityInventorySummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useInventoryData(selectedFacilityId: string | null) {
  const [stockSummary, setStockSummary] = useState<FacilityInventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

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

  useEffect(() => {
    void fetchStockSummary();
  }, [fetchStockSummary]);

  return {
    stockSummary,
    loadingSummary,
    fetchStockSummary,
  };
}
