'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommodityRate, RentType } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export interface CommodityRateState {
  rate: { small: number; big: number } | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Price Controller lookup for the Inward Form.
 * Returns the active authoritative small/big pair for the selected commodity
 * and subscription type. Idle (no fetch) until both are present or when
 * disabled (e.g. structurally locked edits show stored history instead).
 */
export function useCommodityRate(
  commodityId: string,
  rentType: RentType,
  opts?: { disabled?: boolean },
): CommodityRateState {
  const [rate, setRate] = useState<{ small: number; big: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const beginRequest = useRequestGuard();
  const disabled = opts?.disabled ?? false;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (disabled || !commodityId) {
      setRate(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    requestWithAuth(
      `/api/commodities/${encodeURIComponent(commodityId)}/rates?rentType=${encodeURIComponent(rentType)}`,
    )
      .then(async (res) => {
        if (!isCurrent()) return;
        if (res.status === 404) {
          setRate(null);
          setError(null);
          return;
        }
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { rate?: CommodityRate };
        if (!isCurrent()) return;
        setRate(data.rate ? { small: data.rate.smallRate, big: data.rate.bigRate } : null);
      })
      .catch((e: unknown) => {
        if (!isCurrent()) return;
        setRate(null);
        setError(e instanceof Error ? e.message : 'Failed to load rates');
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [commodityId, rentType, disabled, attempt, beginRequest]);

  return { rate, loading, error, retry };
}
