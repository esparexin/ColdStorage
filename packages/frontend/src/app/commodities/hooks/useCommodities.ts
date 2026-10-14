'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Commodity, CommodityRate } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export const COMMODITY_PAGE_SIZE = 20;

export function useCommodities() {
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [ratesMap, setRatesMap] = useState<Record<string, CommodityRate[]>>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTermRaw] = useState('');

  // Search narrows the client-side set, so page 1 is the only valid page.
  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  }, []);

  const fetchCommodities = useCallback(async () => {
    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const res = await requestWithAuth('/api/commodities');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items?: Commodity[] };
      if (!isCurrent()) return;
      const items = data.items ?? [];
      setCommodities(items);
      setLoading(false);

      // Rates arrive inline on the list response. This used to fire one
      // `GET /api/commodities/:id/rates` per commodity in a Promise.all, so a
      // facility with N commodities issued 1 + N requests to render one table,
      // and every one of them independently went through the 401-refresh path.
      if (!isCurrent()) return;
      const newMap: Record<string, CommodityRate[]> = {};
      for (const c of items) {
        newMap[c.id] = c.rates ?? [];
      }
      setRatesMap(newMap);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load commodities');
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRatesLoading(false);
      }
    }
  }, [beginRequest]);

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
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update commodity status');
      }

      await fetchCommodities();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const totalPages = Math.ceil(filteredCommodities.length / COMMODITY_PAGE_SIZE);

  return {
    commodities: filteredCommodities.slice(
      (page - 1) * COMMODITY_PAGE_SIZE,
      page * COMMODITY_PAGE_SIZE,
    ),
    totalCommodities: filteredCommodities.length,
    totalPages,
    page,
    setPage,
    pageSize: COMMODITY_PAGE_SIZE,
    loading,
    error,
    ratesMap,
    ratesLoading,
    searchTerm,
    setSearchTerm,
    filteredCommodities,
    fetchCommodities,
    handleToggleActive,
  };
}
