'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Role, UserSummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { useFacility } from '@/context/FacilityContext';

const PAGE_SIZE = 20;

export function useUsersData(canManage: boolean) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');

  // Facility options are already loaded application-wide by FacilityProvider. Fetching them a
  // second time here produced two independent copies of the same list.
  const { availableFacilities } = useFacility();

  const fetchUsers = useCallback(async () => {
    if (!canManage) return;
    setLoadingUsers(true);
    setLoadError(null);
    try {
      const res = await requestWithAuth(`/api/users?page=${page}&limit=${PAGE_SIZE}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load users (HTTP ${res.status})`);
      }
      const data = (await res.json()) as {
        items: UserSummary[];
        total: number;
      };
      setUsers(data.items || []);
      setTotalUsers(data.total || 0);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
      setTotalUsers(0);
    } finally {
      setLoadingUsers(false);
    }
  }, [canManage, page]);

  useEffect(() => {
    if (canManage) {
      void fetchUsers();
    }
  }, [canManage, fetchUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = !roleFilter || u.role === roleFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.employeeId.toLowerCase().includes(term) ||
        u.mobile.includes(term);
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchTerm]);

  const facilityNameMap = useMemo(() => {
    return new Map(availableFacilities.map((f) => [f.id, f.name || f.code]));
  }, [availableFacilities]);

  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

  return {
    totalUsers,
    page,
    setPage,
    totalPages,
    loadingUsers,
    loadError,
    facilityNameMap,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    filteredUsers,
    fetchUsers,
  };
}