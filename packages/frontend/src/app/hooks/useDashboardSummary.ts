import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export function useDashboardSummary(facilityId: string | null) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const res = await requestWithAuth(`/api/facilities/${facilityId}/dashboard/summary`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { summary: DashboardSummary };
            if (!isCurrent()) return;
setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
}
