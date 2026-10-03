'use client';

/**
 * FacilityContext — owns the currently selected facility for display.
 *
 * The selected facilityId is UI state only. It does NOT constitute
 * authorization. The backend independently authorizes every API request
 * via requireFacilityScope. This context is for UI routing only.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  refreshFacilities: () => Promise<void>;
}

const FacilityContext = createContext<FacilityContextValue | null>(null);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [availableFacilities, setAvailableFacilities] = useState<FacilityOption[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);

  const syncFacilities = useCallback(async () => {
    if (!user) {
      setSelectedFacilityId(null);
      setAvailableFacilities([]);
      return;
    }

    setIsLoadingFacilities(true);
    try {
      const res = await requestWithAuth('/api/facilities');
      if (res.ok) {
        const data = (await res.json()) as { items?: FacilityOption[] };
        const facilities = data.items ?? [];
        setAvailableFacilities(facilities);
        const validIds = facilities.map((f) => f.id);
        const assignedValid = user.facilityIds?.filter((fid) => validIds.includes(fid)) ?? [];

        setSelectedFacilityId((current) => {
          if (current && validIds.includes(current)) return current;
          if (assignedValid.length > 0) return assignedValid[0];
          return facilities.length > 0 ? facilities[0].id : null;
        });
      } else if (user.facilityIds && user.facilityIds.length > 0) {
        const fallback = user.facilityIds.map((id) => ({ id, name: id, code: id }));
        setAvailableFacilities(fallback);
        setSelectedFacilityId((current) => current ?? user.facilityIds[0]);
      }
    } catch {
      if (user.facilityIds && user.facilityIds.length > 0) {
        const fallback = user.facilityIds.map((id) => ({ id, name: id, code: id }));
        setAvailableFacilities(fallback);
        setSelectedFacilityId((current) => current ?? user.facilityIds[0]);
      }
    } finally {
      setIsLoadingFacilities(false);
    }
  }, [user]);

  useEffect(() => {
    void syncFacilities();
  }, [syncFacilities]);

  return (
    <FacilityContext.Provider
      value={{
        selectedFacilityId,
        setSelectedFacilityId,
        availableFacilities,
        isLoadingFacilities,
        refreshFacilities: syncFacilities,
      }}
    >
      {children}
    </FacilityContext.Provider>
  );
}

export function useFacility(): FacilityContextValue {
  const ctx = useContext(FacilityContext);
  if (!ctx) throw new Error('useFacility must be used inside FacilityProvider');
  return ctx;
}
