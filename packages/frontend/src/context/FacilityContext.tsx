'use client';

/**
 * FacilityContext — owns the currently selected facility for display.
 *
 * The selected facilityId is UI state only. It does NOT constitute
 * authorization. The backend independently authorizes every API request
 * via requireFacilityScope. This context is for UI routing only.
 */

import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';

interface FacilityContextValue {
  /** Currently selected facility ID (UI state only — not authorization) */
  selectedFacilityId: string | null;
  setSelectedFacilityId: (id: string) => void;
}

const FacilityContext = createContext<FacilityContextValue | null>(null);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const defaultFacility = user?.facilityIds[0] ?? null;
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(defaultFacility);

  return (
    <FacilityContext.Provider value={{ selectedFacilityId, setSelectedFacilityId }}>
      {children}
    </FacilityContext.Provider>
  );
}

export function useFacility(): FacilityContextValue {
  const ctx = useContext(FacilityContext);
  if (!ctx) throw new Error('useFacility must be used inside FacilityProvider');
  return ctx;
}
