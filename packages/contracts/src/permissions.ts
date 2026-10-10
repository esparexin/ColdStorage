import { z } from 'zod';

export const roleSchema = z.enum(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY']);
export type Role = z.infer<typeof roleSchema>;

/**
 * Machine-readable permission matrix (P0-Rule 6 & Architecture Lock).
 * Centralized mapping of permissions to authorized roles.
 */
export const PERMISSIONS = {
  /**
   * Operational inward intake. Also gates the GRN loan/bond status update
   * (`PATCH /facilities/:facilityId/grns/:grnId/loan-status`): loan status is an
   * operational pledge flag, not an evidentiary correction, so OPERATOR may set
   * it. This asymmetry with `grn:correct` below is intentional and frozen by the
   * Inward Edit governance record (see inward-rent-delivery-grn-flow-audit §8).
   */
  'grn:create': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'grn:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  /** Authorized correction of an inward receipt's commodity, bag count or chamber. */
  'grn:correct': ['SUPER_ADMIN', 'ADMIN'],
  /** Confirms a GRN's remaining bags are on hand in its chamber. */
  'allocation:manage': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'inventory:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'delivery:create': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'delivery:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'delivery:reversal': ['SUPER_ADMIN', 'ADMIN'],
  'rent:collect': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'rent:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'rent:print': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  /**
   * Finalize a January/February seasonal extension or override its amount.
   * Creates a financial obligation, so it follows the sensitive-operation
   * precedent (grn:correct, delivery:reversal): SUPER_ADMIN and ADMIN only.
   */
  'rent:extend': ['SUPER_ADMIN', 'ADMIN'],
  /** Chamber is free text; only the tenancy root is a managed entity. */
  'facility:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'customer:manage': ['SUPER_ADMIN', 'ADMIN'],
  'customer:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'commodity:manage': ['SUPER_ADMIN', 'ADMIN'],
  'commodity:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'user:manage': ['SUPER_ADMIN'],
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
 * Whether a role holds unrestricted tenancy scope.
 *
 * Callers that need "all facilities" behaviour previously compared the role against the
 * SUPER_ADMIN literal inline in six places. Routing every one of them through this predicate
 * keeps the tenancy rule in a single location, as required by the architecture lock.
 */
export function hasGlobalFacilityScope(role: Role): boolean {
  return role === 'SUPER_ADMIN';
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
  if (hasGlobalFacilityScope(role)) {
    return true;
  }
  return userFacilityIds.includes(targetFacilityId);
}
