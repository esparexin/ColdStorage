'use client';

import { useCallback, useMemo } from 'react';
import { can, type PermissionKey, type Role } from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';

/**
 * Central permission reader for customizable RBAC.
 * Prefers DB-resolved `user.permissions` (populated from /me); falls back to
 * the static `can(role)` matrix for sessions minted before role seeding.
 * Display filtering only — every API still enforces permissions server-side.
 */
export function usePermissions() {
  const { user } = useAuth();

  const permissions = useMemo(() => user?.permissions as PermissionKey[] | undefined, [user]);
  const userRole = useMemo(() => (user?.role ?? 'READ_ONLY') as Role, [user]);

  const hasPermission = useCallback(
    (permission: PermissionKey): boolean => {
      if (permissions) return (permissions as readonly PermissionKey[]).includes(permission);
      return can(userRole, permission);
    },
    [permissions, userRole],
  );

  const hasAny = useCallback(
    (required: PermissionKey[]): boolean => required.some((perm) => hasPermission(perm)),
    [hasPermission],
  );

  return { user, userRole, permissions, hasPermission, hasAny };
}
