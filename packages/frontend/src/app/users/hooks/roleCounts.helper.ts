import type { RoleDefinition, UserSummary } from '@cold-storage/contracts';

/**
 * Counts users per role id without double-counting.
 * Prefers the resolved `roleId`; falls back to the legacy `role` key mapping.
 * Each user contributes exactly one increment.
 */
export function countUsersByRole(
  users: UserSummary[],
  roles: RoleDefinition[],
): Map<string, number> {
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const rolesByKey = new Map(roles.map((r) => [r.key, r]));
  const counts = new Map<string, number>();
  for (const user of users) {
    const byId = user.roleId ? rolesById.get(user.roleId) : undefined;
    const key = byId?.key ?? user.role;
    const target = rolesByKey.get(key);
    const id = target?.id ?? user.roleId ?? user.role;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
