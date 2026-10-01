import { z } from 'zod';

export const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY']);
export type Role = z.infer<typeof roleSchema>;

/**
 * Machine-readable permission matrix (P0-Rule 6 & Architecture Lock).
 * Centralized mapping of permissions to authorized roles.
 */
export const PERMISSIONS = {
  'grn:create': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'grn:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'grn:close': ['SUPER_ADMIN', 'ADMIN'],
  'rack:allocate': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'inventory:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'inventory:correct': ['SUPER_ADMIN', 'ADMIN'],
  'delivery:create': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'delivery:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'delivery:reversal': ['SUPER_ADMIN', 'ADMIN'],
  'rent:collect': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'rent:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'rent:print': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'storage:manage': ['SUPER_ADMIN', 'ADMIN'],
  'storage:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'customer:manage': ['SUPER_ADMIN', 'ADMIN'],
  'customer:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'commodity:manage': ['SUPER_ADMIN', 'ADMIN'],
  'commodity:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'user:manage': ['SUPER_ADMIN'],
  'report:view': ['SUPER_ADMIN', 'ADMIN', 'READ_ONLY'],
  'document:print': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'import:execute': ['SUPER_ADMIN', 'ADMIN'],
  'export:execute': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'backup:manage': ['SUPER_ADMIN'],
  'audit:view': ['SUPER_ADMIN', 'ADMIN'],
  'settings:manage': ['SUPER_ADMIN'],
  'dashboard:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionKey = keyof typeof PERMISSIONS;

/**
 * Checks if a given role is granted a specific permission.
 */
export function can(role: Role, permission: PermissionKey): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly Role[];
  return allowedRoles.includes(role);
}

/**
 * Facility-scoped authorization check:
 * - SUPER_ADMIN has global scope across all facilities.
 * - Other roles must have the target facility ID in their assigned facilityIds.
 */
export function inFacilityScope(
  role: Role,
  userFacilityIds: string[],
  targetFacilityId: string,
): boolean {
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  return userFacilityIds.includes(targetFacilityId);
}
