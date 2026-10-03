'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Commodity } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useCommodities() {
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCommodities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth('/api/commodities');
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Commodity[] };
      setCommodities(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load commodities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCommodities();
  }, [fetchCommodities]);

  const filteredCommodities = useMemo(() => {
    if (!searchTerm.trim()) return commodities;
    const term = searchTerm.toLowerCase();
    return commodities.filter((c) => c.name.toLowerCase().includes(term));
  }, [commodities, searchTerm]);

  const handleToggleActive = async (commodity: Commodity) => {
    try {
      const res = await requestWithAuth(`/api/commodities/${commodity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !commodity.isActive,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to update commodity status');
      }

      await fetchCommodities();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  return {
    commodities,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filteredCommodities,
    fetchCommodities,
    handleToggleActive,
  };
}
