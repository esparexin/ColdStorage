'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { requestWithAuth } from '../../../lib/api-client';

/**
 * Deduplicates and merges initial caller GRNs, facility-wide open GRNs,
 * and guarantees the current GRN is always present in the pool.
 */
export function mergeOpenGrnsPool(
  currentGrn: Grn,
  initialGrns: Grn[] = [],
  facilityOpenGrns: Grn[] = [],
): Grn[] {
  const map = new Map<string, Grn>();
  for (const g of initialGrns) {
    map.set(g.id, g);
  }
  for (const g of facilityOpenGrns) {
    map.set(g.id, g);
  }
  map.set(currentGrn.id, currentGrn);
  return Array.from(map.values());
}

/**
 * Loads all facility-wide open GRNs (status=OPEN) so Internal Movement
 * has access to all active and partial lots across all pages, independent
 * of the user's active table tab and pagination state.
 */
export function useOpenFacilityGrns(
  facilityId: string | null | undefined,
  currentGrn: Grn,
  initialGrns: Grn[] = [],
): Grn[] {
  const [facilityOpenGrns, setFacilityOpenGrns] = useState<Grn[]>([]);

  useEffect(() => {
    let active = true;
    if (!facilityId) return;

    requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns?status=OPEN&limit=100`)
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as { items?: Grn[] };
        if (Array.isArray(data.items)) {
          setFacilityOpenGrns(data.items);
        }
      })
      .catch(() => {
        // Fall back gracefully to initialGrns
      });

    return () => {
      active = false;
    };
  }, [facilityId]);

  return useMemo(
    () => mergeOpenGrnsPool(currentGrn, initialGrns, facilityOpenGrns),
    [currentGrn, initialGrns, facilityOpenGrns],
  );
}
