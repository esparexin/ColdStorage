'use client';

import { useCallback, useRef } from 'react';

/**
 * Guards against a superseded async read overwriting newer state.
 *
 * Every facility-scoped hook re-reads when the selected facility changes. If the
 * operator switches facility twice quickly, the first request is still in flight
 * when the second starts, and because it was issued first it can resolve last —
 * leaving the previous facility's rows on screen with the new facility selected.
 *
 * Usage:
 *   const beginRequest = useRequestGuard();
 *   const res = await requestWithAuth(url);
 *   if (!beginRequest()) return;   // a newer request has superseded this one
 *   setState(...);
 *
 * Only one hook owns a given request sequence, so this stays local rather than
 * becoming a cache.
 */
export function useRequestGuard(): () => () => boolean {
  const latestId = useRef(0);

  return useCallback(() => {
    latestId.current += 1;
    const thisId = latestId.current;
    return () => thisId === latestId.current;
  }, []);
}