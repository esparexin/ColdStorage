'use client';

import { useCallback, useState } from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export interface RentGateState {
  rentSummary: RentSummaryDto | null;
  rentLoading: boolean;
  refreshRentGate: (facilityId: string, grnId: string) => Promise<RentSummaryDto | null>;
  resetRentGate: () => void;
}

/**
 * Shared Inward → Rent gate state for outward delivery flows.
 * Single canonical reader of GET /rent/grn/:id; exposes the SSOT
 * RentSummaryDto. No payment logic lives here.
 */
export function useRentGate(): RentGateState {
  const [rentSummary, setRentSummary] = useState<RentSummaryDto | null>(null);
  const [rentLoading, setRentLoading] = useState(false);

  const refreshRentGate = useCallback(async (facilityId: string, grnId: string) => {
    if (!facilityId || !grnId) {
      setRentSummary(null);
      return null;
    }
    setRentLoading(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(grnId)}`,
      );
      if (!res.ok) {
        setRentSummary(null);
        return null;
      }
      const summary = (await res.json()) as RentSummaryDto;
      setRentSummary(summary);
      return summary;
    } catch {
      setRentSummary(null);
      return null;
    } finally {
      setRentLoading(false);
    }
  }, []);

  const resetRentGate = useCallback(() => setRentSummary(null), []);

  return { rentSummary, rentLoading, refreshRentGate, resetRentGate };
}
