import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { cachedRequestWithAuth } from '@/lib/api-cache';

const DASHBOARD_CACHE_TTL_MS = 30 * 1000;

export function useDashboardSummary(facilityId: string | null) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(
    async (force = false) => {
      if (!facilityId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const isCurrent = beginRequest();
      try {
        const res = await cachedRequestWithAuth(
          `/api/facilities/${facilityId}/dashboard/summary`,
          { ttlMs: DASHBOARD_CACHE_TTL_MS, force },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { summary: DashboardSummary };
        if (!isCurrent()) return;
        setSummary(data.summary);
      } catch (e) {
        if (!isCurrent()) return;
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [facilityId, beginRequest],
  );

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const refetch = useCallback(() => fetchSummary(true), [fetchSummary]);

  return { summary, loading, error, refetch };
}

