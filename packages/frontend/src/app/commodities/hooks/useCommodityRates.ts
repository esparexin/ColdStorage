'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommodityRate } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';
import type { RateUpsertPayload } from '../components/commodityRates.helper';

/**
 * Price Controller administration for one commodity.
 * Lists active and inactive rows; upserts Seasonal + Monthly together so the
 * two subscription types can never drift out of sync.
 */
export function useCommodityRates(commodityId: string | null) {
  const [rates, setRates] = useState<CommodityRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const beginRequest = useRequestGuard();

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const fetchRates = useCallback(async () => {
    if (!commodityId) {
      setRates([]);
      return;
    }
    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const res = await requestWithAuth(`/api/commodities/${encodeURIComponent(commodityId)}/rates`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: CommodityRate[] };
      if (!isCurrent()) return;
      setRates(data.items ?? []);
    } catch (e) {
      if (!isCurrent()) return;
      setRates([]);
      setError(e instanceof Error ? e.message : 'Failed to load rates');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [commodityId, beginRequest]);

  useEffect(() => {
    void fetchRates();
  }, [fetchRates, attempt]);

  const saveRates = useCallback(
    async (payloads: RateUpsertPayload[]): Promise<void> => {
      if (!commodityId) throw new Error('No commodity selected');
      setSaving(true);
      try {
        for (const payload of payloads) {
          const res = await requestWithAuth(
            `/api/commodities/${encodeURIComponent(commodityId)}/rates`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `Failed to save ${payload.rentType} rates`);
          }
        }
        await fetchRates();
      } finally {
        setSaving(false);
      }
    },
    [commodityId, fetchRates],
  );

  return { rates, loading, error, retry, saving, saveRates };
}
