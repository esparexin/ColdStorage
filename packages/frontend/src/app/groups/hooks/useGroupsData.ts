import { useCallback, useEffect, useState } from 'react';
import type { Customer, Group } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export const GROUP_PAGE_SIZE = 20;

export function useGroupsData(selectedFacilityId: string | null) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTermRaw] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);

  const beginRequest = useRequestGuard();

  const setSearchTerm = useCallback((v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  }, []);

  const fetchLookups = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/customers?facilityId=${encodeURIComponent(selectedFacilityId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Customer[] };
        setCustomers((data.items ?? []).filter((c) => c.isActive));
      }
    } catch {
      // Lookups fail gracefully without halting UI
    }
  }, [selectedFacilityId]);

  const fetchGroups = useCallback(async () => {
    if (!selectedFacilityId) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(GROUP_PAGE_SIZE));
      if (searchTerm.trim()) {
        params.set('search', searchTerm.trim());
      }

      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups?${params.toString()}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { items?: Group[]; total?: number };
      if (!isCurrent()) return;

      setGroups(data.items ?? []);
      setTotalGroups(data.total ?? 0);
      setTotalPages(Math.ceil((data.total ?? 0) / GROUP_PAGE_SIZE));
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : 'Failed to load groups');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [selectedFacilityId, page, searchTerm, beginRequest]);

  useEffect(() => {
    setPage(1);
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  return {
    groups,
    totalGroups,
    totalPages,
    page,
    setPage,
    pageSize: GROUP_PAGE_SIZE,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    customers,
    fetchGroups,
  };
}
