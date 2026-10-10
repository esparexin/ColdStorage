'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CreateRole, RoleDefinition, UpdateRole } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useRolesData(enabled: boolean) {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth('/api/roles');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load roles (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { roles: RoleDefinition[] };
      setRoles(data.roles ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const createRole = useCallback(
    async (input: CreateRole): Promise<RoleDefinition | null> => {
      setSaving(true);
      setActionError(null);
      try {
        const res = await requestWithAuth('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to create role (HTTP ${res.status})`);
        }
        const data = (await res.json()) as { role: RoleDefinition };
        await fetchRoles();
        return data.role;
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Role creation failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [fetchRoles],
  );

  const updateRole = useCallback(
    async (id: string, input: UpdateRole): Promise<RoleDefinition | null> => {
      setSaving(true);
      setActionError(null);
      try {
        const res = await requestWithAuth(`/api/roles/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to update role (HTTP ${res.status})`);
        }
        const data = (await res.json()) as { role: RoleDefinition };
        await fetchRoles();
        return data.role;
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Role update failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [fetchRoles],
  );

  const deleteRole = useCallback(
    async (id: string): Promise<boolean> => {
      setSaving(true);
      setActionError(null);
      try {
        const res = await requestWithAuth(`/api/roles/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to delete role (HTTP ${res.status})`);
        }
        await fetchRoles();
        return true;
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Role deletion failed');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchRoles],
  );

  return { roles, loading, error, saving, actionError, setActionError, fetchRoles, createRole, updateRole, deleteRole };
}
