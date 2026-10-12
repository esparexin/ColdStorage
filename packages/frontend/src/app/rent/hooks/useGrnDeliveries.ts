'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { useRequestGuard } from '../../../hooks/useRequestGuard';
import { requestWithAuth } from '../../../lib/api-client';
import { summarizeOutwardRent } from './rentDeliveries.helper';

export {
  categorizeOutwardBags,
  deriveOutwardPeriodLabel,
  formatOutwardBagBreakdown,
  summarizeOutwardRent,
  type OutwardBagCategory,
  type OutwardRentSummaryMetrics,
} from './rentDeliveries.helper';

export function useGrnDeliveries(facilityId: string, grnId: string) {
  const [deliveries, setDeliveries] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useRequestGuard();

  const fetchDeliveries = useCallback(async () => {
    if (!facilityId || !grnId) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}/deliveries`,
      );
      if (!isCurrent()) return;
      if (res.ok) {
        const data = (await res.json()) as { deliveries: DeliveryChallan[] };
        setDeliveries(data.deliveries ?? []);
      } else {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        setError(errData.message || 'Failed to fetch outward deliveries');
      }
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Network error loading deliveries');
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [facilityId, grnId, beginRequest]);

  useEffect(() => {
    void fetchDeliveries();
  }, [fetchDeliveries]);

  const metrics = summarizeOutwardRent(deliveries);

  return {
    deliveries,
    loading,
    error,
    metrics,
    totalOutwardRent: metrics.totalRent,
    totalOutwardBags: metrics.totalBags,
    refetch: fetchDeliveries,
  };
}
