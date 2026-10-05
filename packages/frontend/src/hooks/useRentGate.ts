'use client';

import { useCallback, useState } from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export interface RentGateState {
  rentSummary: RentSummaryDto | null;
  rentLoading: boolean;
  /** True when no payment has been made yet against a positive rent obligation. */
  rentBlocked: boolean;
  /** True when partially paid: warn-and-continue, do not block. */
  rentPartial: boolean;
  refreshRentGate: (facilityId: string, grnId: string) => Promise<RentSummaryDto | null>;
  resetRentGate: () => void;
}

/**
 * Shared Inward → Rent gate state for outward delivery flows.
 * Single canonical reader of GET /rent/grn/:id; derives blocked/partial
 * from the SSOT RentSummaryDto. No payment logic lives here.
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

  const rentBlocked =
    rentSummary !== null &&
    rentSummary.rentAmount > 0 &&
    rentSummary.totalPaid === 0 &&
    rentSummary.remainingBalance > 0;
  const rentPartial =
    rentSummary !== null && rentSummary.totalPaid > 0 && rentSummary.remainingBalance > 0;

  return { rentSummary, rentLoading, rentBlocked, rentPartial, refreshRentGate, resetRentGate };
}
