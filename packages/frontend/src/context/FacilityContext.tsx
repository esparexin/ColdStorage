'use client';

/**
 * FacilityContext — owns the currently selected facility for display.
 *
 * The selected facilityId is UI state only. It does NOT constitute
 * authorization. The backend independently authorizes every API request
 * via requireFacilityScope. This context is for UI routing only.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth, type AuthUser } from './AuthContext';
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
}

const FacilityContext = createContext<FacilityContextValue | null>(null);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [availableFacilities, setAvailableFacilities] = useState<FacilityOption[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      setSelectedFacilityId(null);
      setAvailableFacilities([]);
      return;
    }

    const activeUser: AuthUser = user;
    let cancelled = false;

    async function syncFacilities(activeUser: AuthUser) {
      setIsLoadingFacilities(true);
      try {
        const res = await requestWithAuth('/api/facilities');
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { items?: FacilityOption[] };
          const facilities = data.items ?? [];
          if (!cancelled) {
            setAvailableFacilities(facilities);
            const validIds = facilities.map((f) => f.id);
            const assignedValid =
              activeUser.facilityIds?.filter((fid) => validIds.includes(fid)) ?? [];

            setSelectedFacilityId((current) => {
              if (current && validIds.includes(current)) {
                return current;
              }
              if (assignedValid.length > 0) {
                return assignedValid[0];
              }
              return facilities.length > 0 ? facilities[0].id : null;
            });
          }
        } else if (!cancelled && activeUser.facilityIds && activeUser.facilityIds.length > 0) {
          const fallback = activeUser.facilityIds.map((id) => ({
            id,
            name: id,
            code: id,
          }));
          setAvailableFacilities(fallback);
          setSelectedFacilityId((current) => current ?? activeUser.facilityIds[0]);
        }
      } catch {
        if (!cancelled && activeUser.facilityIds && activeUser.facilityIds.length > 0) {
          const fallback = activeUser.facilityIds.map((id) => ({
            id,
            name: id,
            code: id,
          }));
          setAvailableFacilities(fallback);
          setSelectedFacilityId((current) => current ?? activeUser.facilityIds[0]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFacilities(false);
        }
      }
    }

    void syncFacilities(activeUser);

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <FacilityContext.Provider
      value={{
        selectedFacilityId,
        setSelectedFacilityId,
        availableFacilities,
        isLoadingFacilities,
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
