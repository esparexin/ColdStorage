'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react';
import type { SystemSettings } from '@cold-storage/contracts';
import { useAuth } from './AuthContext';
import { requestWithAuth } from '@/lib/api-client';

interface SettingsContextValue {
  settings: SystemSettings | null;
  isConfigured: boolean;
  isLoadingSettings: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setIsConfigured(false);
      return;
    }

    setIsLoadingSettings(true);
    try {
      const res = await requestWithAuth('/api/settings');
      if (res.ok) {
        const data = (await res.json()) as {
          settings?: SystemSettings;
          isConfigured?: boolean;
        };
        if (data.settings) {
          setSettings(data.settings);
          setIsConfigured(Boolean(data.isConfigured));
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setIsLoadingSettings(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  // Memoized: an inline literal re-renders every settings consumer on every
  // provider render, including the header on every route change.
  const contextValue = useMemo(
    () => ({ settings, isConfigured, isLoadingSettings, refreshSettings: fetchSettings }),
    [settings, isConfigured, isLoadingSettings, fetchSettings],
  );

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return ctx;
}
