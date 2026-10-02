'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Role, UserSummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import type { FacilityOption } from '../types';

export function useUsersData(canManage: boolean) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [availableFacilities, setAvailableFacilities] = useState<FacilityOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');

  const fetchUsers = useCallback(async () => {
    if (!canManage) return;
    setLoadingUsers(true);
    try {
      const res = await requestWithAuth(`/api/users?page=${page}&limit=${limit}`);
      if (res.ok) {
        const data = (await res.json()) as {
          items: UserSummary[];
          total: number;
          page: number;
          limit: number;
        };
        setUsers(data.items || []);
        setTotalUsers(data.total || 0);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingUsers(false);
    }
  }, [canManage, page, limit]);

  const fetchFacilities = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await requestWithAuth('/api/facilities');
      if (res.ok) {
        const data = (await res.json()) as { items?: FacilityOption[] };
        setAvailableFacilities(data.items || []);
      }
    } catch {
      // Handled silently
    }
  }, [canManage]);

  useEffect(() => {
    if (canManage) {
      void fetchUsers();
      void fetchFacilities();
    }
  }, [canManage, fetchUsers, fetchFacilities]);

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

  const totalPages = Math.ceil(totalUsers / limit);

  return {
    users,
    totalUsers,
    page,
    setPage,
    totalPages,
    loadingUsers,
    availableFacilities,
    facilityNameMap,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    filteredUsers,
    fetchUsers,
  };
}
