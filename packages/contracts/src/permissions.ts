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
  'inventory:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'delivery:create': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'delivery:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'rent:collect': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'rent:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'rent:print': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  /**
   * Finalize a recurring billing period (seasonal renewal or Jan/Feb monthly)
   * or override its amount. Creates a financial obligation, so it follows the
   * sensitive-operation precedent: SUPER_ADMIN and ADMIN only.
   */
  'rent:extend': ['SUPER_ADMIN', 'ADMIN'],
  /** Chamber is free text; only the tenancy root is a managed entity. */
  'facility:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'customer:manage': ['SUPER_ADMIN', 'ADMIN'],
  'customer:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'commodity:manage': ['SUPER_ADMIN', 'ADMIN'],
  'commodity:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'user:manage': ['SUPER_ADMIN'],
  /** Create, update and delete customizable role definitions. */
  'role:manage': ['SUPER_ADMIN'],
  'document:print': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'import:execute': ['SUPER_ADMIN', 'ADMIN'],
  'export:execute': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'backup:manage': ['SUPER_ADMIN'],
  'audit:view': ['SUPER_ADMIN', 'ADMIN'],
  'settings:manage': ['SUPER_ADMIN'],
  'dashboard:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'group:view': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'],
  'group:manage': ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'],
  'group:delete': ['SUPER_ADMIN', 'ADMIN'],
  /** Testing-only deletion of GRN records and their dependent data. Never enabled in production. */
  'grn:delete': ['SUPER_ADMIN', 'ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Stable catalog of every assignable permission key. */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const permissionKeySchema = z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

/**
 * Sidebar-aligned grouping so role editors render the same sections
 * as the application menu without hardcoding a second list.
 */
export const PERMISSION_GROUPS = {
  Operations: [
    'dashboard:view',
    'grn:create',
    'grn:view',
    'grn:correct',
    'inventory:view',
    'delivery:create',
    'delivery:view',
    'rent:collect',
    'rent:view',
    'rent:print',
    'rent:extend',
    'document:print',
    'group:view',
    'group:manage',
    'group:delete',
  ],
  'Master Data': ['customer:view', 'customer:manage', 'commodity:view', 'commodity:manage', 'facility:view'],
  Administration: [
    'user:manage',
    'role:manage',
    'settings:manage',
    'audit:view',
    'backup:manage',
    'import:execute',
    'export:execute',
  ],
} as const satisfies Record<string, readonly PermissionKey[]>;

export type PermissionGroupName = keyof typeof PERMISSION_GROUPS;

/** Reusable role-definition identity: UPPER_SNAKE, e.g. BILLING_CLERK. */
export const roleKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Role key must be UPPER_SNAKE (letters, numbers, underscores)');

export const roleIdSchema = z.string().trim().min(1).max(80);

export const roleDefinitionSchema = z.object({
  id: roleIdSchema,
  key: roleKeySchema,
  displayName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).default(''),
  permissions: z.array(permissionKeySchema).min(1, 'Role must grant at least one permission'),
  hasGlobalFacilityScope: z.boolean().default(false),
  isSystem: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type RoleDefinition = z.infer<typeof roleDefinitionSchema>;

export const createRoleSchema = z.object({
  key: roleKeySchema,
  displayName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).default(''),
  permissions: z.array(permissionKeySchema).min(1, 'Role must grant at least one permission'),
  hasGlobalFacilityScope: z.boolean().default(false),
});

export type CreateRole = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280),
    permissions: z.array(permissionKeySchema).min(1, 'Role must grant at least one permission'),
    hasGlobalFacilityScope: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one updatable field must be provided',
  });

export type UpdateRole = z.infer<typeof updateRoleSchema>;

/**
 * Checks if a given role is granted a specific permission.
 * Legacy static-matrix check. Prefer `hasPermission` for DB-resolved roles.
 */
export function can(role: Role, permission: PermissionKey): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly Role[];
  return allowedRoles.includes(role);
}

/** Permission-set check for customizable roles resolved from the database. */
export function hasPermission(granted: readonly PermissionKey[], permission: PermissionKey): boolean {
  return granted.includes(permission);
}

/**
 * Derives the static permission set for a legacy system role.
 * Used to seed system RoleDefinitions so behavior stays bit-for-bit identical.
 */
export function permissionsForRole(role: Role): PermissionKey[] {
  return (Object.keys(PERMISSIONS) as PermissionKey[]).filter((key) => can(role, key));
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
