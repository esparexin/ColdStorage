import { useEffect, useMemo, useState } from 'react';
import type { Commodity, Customer, Grn, GrnStatus } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

interface UseGrnStockParams {
  selectedFacilityId: string | null;
  canViewGrnStock: boolean;
}

export function useGrnStock({ selectedFacilityId, canViewGrnStock }: UseGrnStockParams) {
  const [grns, setGrns] = useState<Grn[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchGrns = async () => {
    if (!canViewGrnStock || !selectedFacilityId) {
      setGrns([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?limit=100`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load facility GRNs');
      }
      const data = (await res.json()) as { items?: Grn[] };
      setGrns(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading GRNs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGrns();
    setPage(1);
  }, [selectedFacilityId, canViewGrnStock]);

  useEffect(() => {
    if (!selectedFacilityId) {
      setCustomers([]);
      setCommodities([]);
      return;
    }
    void (async () => {
      try {
        const [custRes, commRes] = await Promise.all([
          requestWithAuth(`/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`),
          requestWithAuth('/api/commodities'),
        ]);
        if (custRes.ok) {
          const data = (await custRes.json()) as { items?: Customer[] };
          setCustomers(data.items || []);
        }
        if (commRes.ok) {
          const data = (await commRes.json()) as { items?: Commodity[] };
          setCommodities(data.items || []);
        }
      } catch {
        // Non-critical lookups fallback
      }
    })();
  }, [selectedFacilityId]);

  const filteredGrns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return grns.filter((g) => {
      if (statusFilter && g.status !== statusFilter) return false;
      if (!term) return true;
      return (
        g.grnNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        g.commodityName.toLowerCase().includes(term) ||
        g.chamber.toLowerCase().includes(term) ||
        (Boolean(g.gpNumber) && g.gpNumber!.toLowerCase().includes(term))
      );
    });
  }, [grns, searchTerm, statusFilter]);

  const tabCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const g of grns) {
      if (g.status === 'CLOSED') closed++;
      else open++;
    }
    return { all: grns.length, open, closed };
  }, [grns]);

  const totalPages = Math.max(1, Math.ceil(filteredGrns.length / pageSize));
  const pagedGrns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGrns.slice(start, start + pageSize);
  }, [filteredGrns, page, pageSize]);

  const mergeInMap = useMemo(() => {
    const map = new Map<string, { sourceNumbers: string[]; date: string | Date | null }>();
    for (const g of grns) {
      const targetNumber = g.mergedIntoGrnNumber;
      const targetId = g.mergedIntoGrnId;
      if (!targetNumber && !targetId) continue;

      const match = g.remarks?.match(/on\s+(\d{4}-\d{2}-\d{2})/);
      const dateVal = match?.[1] ?? g.updatedAt ?? null;

      const keys = [targetNumber, targetId].filter(Boolean) as string[];
      for (const k of keys) {
        const existing = map.get(k) || { sourceNumbers: [], date: dateVal };
        if (!existing.sourceNumbers.includes(g.grnNumber)) {
          existing.sourceNumbers.push(g.grnNumber);
        }
        if (!existing.date && dateVal) {
          existing.date = dateVal;
        }
        map.set(k, existing);
      }
    }
    return map;
  }, [grns]);

  return {
    grns,
    customers,
    commodities,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    fetchGrns,
    filteredGrns,
    tabCounts,
    totalPages,
    pagedGrns,
    mergeInMap,
  };
}
