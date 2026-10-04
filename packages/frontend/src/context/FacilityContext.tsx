'use client';

/**
 * FacilityContext — owns the currently selected facility for display.
 *
 * The selected facilityId is UI state only. It does NOT constitute
 * authorization. The backend independently authorizes every API request
 * via requireFacilityScope. This context is for UI routing only.
 */

import React, { createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { requestWithAuth } from '@/lib/api-client';

export interface FacilityOption {
  id: string;
  name: string;
  code: string;
}

interface FacilityContextValue {
  /** Currently selected facility ID (UI state only — not authorization) */
  selectedFacilityId: string | null;
  setSelectedFacilityId: (id: string) => void;
  availableFacilities: FacilityOption[];
  isLoadingFacilities: boolean;
  /** Non-null when the facility list could not be loaded; no synthetic facilities are used. */
  facilitiesError: string | null;
  refreshFacilities: () => Promise<void>;
}

const FacilityContext = createContext<FacilityContextValue | null>(null);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [availableFacilities, setAvailableFacilities] = useState<FacilityOption[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);

  const syncFacilities = useCallback(async () => {
    if (!user) {
      setSelectedFacilityId(null);
      setAvailableFacilities([]);
      setFacilitiesError(null);
      return;
    }

    setIsLoadingFacilities(true);
    try {
      const res = await requestWithAuth('/api/facilities');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: FacilityOption[] };
      const facilities = data.items ?? [];
      setAvailableFacilities(facilities);
      setFacilitiesError(null);
      const validIds = facilities.map((f) => f.id);
      const assignedValid = user.facilityIds?.filter((fid) => validIds.includes(fid)) ?? [];

      setSelectedFacilityId((current) => {
        if (current && validIds.includes(current)) return current;
        if (assignedValid.length > 0) return assignedValid[0];
        return facilities.length > 0 ? facilities[0].id : null;
      });
    } catch (e) {
      // Explicit error state: never synthesize {id, name:id, code:id} placeholder
      // facilities. Consumers render an error/empty state instead of raw IDs.
      setAvailableFacilities([]);
      setSelectedFacilityId(null);
      setFacilitiesError(e instanceof Error ? e.message : 'Failed to load facilities');
    } finally {
      setIsLoadingFacilities(false);
    }
  }, [user]);

  useEffect(() => {
    void syncFacilities();
  }, [syncFacilities]);

  // Memoized: the facility list is consumed by the header, the sidebar and
  // every list screen, so an unmemoized value re-renders all of them.
  const contextValue = useMemo(
    () => ({
      selectedFacilityId,
      setSelectedFacilityId,
      availableFacilities,
      isLoadingFacilities,
      facilitiesError,
      refreshFacilities: syncFacilities,
    }),
    [selectedFacilityId, availableFacilities, isLoadingFacilities, facilitiesError, syncFacilities],
  );

  return (
    <FacilityContext.Provider value={contextValue}>
      {children}
    </FacilityContext.Provider>
  );
}

export function useFacility(): FacilityContextValue {
  const ctx = useContext(FacilityContext);
  if (!ctx) throw new Error('useFacility must be used inside FacilityProvider');
  return ctx;
}
