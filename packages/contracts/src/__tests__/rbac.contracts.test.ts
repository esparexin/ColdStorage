import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  can,
  createRoleSchema,
  hasPermission,
  permissionsForRole,
  roleDefinitionSchema,
  updateRoleSchema,
} from '../permissions.js';
import { createUserSchema as createUser } from '../user.js';

describe('RBAC customizable roles contracts', () => {
  it('catalog covers every permission key exactly once', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(Object.keys(PERMISSIONS).length);
    for (const key of Object.keys(PERMISSIONS)) {
      expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('permission groups cover the catalog without inventing keys', () => {
    const grouped = Object.values(PERMISSION_GROUPS).flat();
    for (const key of grouped) {
      expect(PERMISSION_KEYS).toContain(key);
    }
    for (const key of ['dashboard:view', 'grn:view', 'user:manage', 'role:manage']) {
      expect(grouped).toContain(key);
    }
  });

  it('system role seeds match the static matrix', () => {
    expect(permissionsForRole('SUPER_ADMIN')).toEqual(
      expect.arrayContaining(['user:manage', 'role:manage', 'backup:manage']),
    );
    expect(can('OPERATOR', 'grn:create')).toBe(true);
    expect(can('OPERATOR', 'grn:correct')).toBe(false);
    expect(can('READ_ONLY', 'dashboard:view')).toBe(true);
    expect(can('READ_ONLY', 'user:manage')).toBe(false);
    expect(permissionsForRole('OPERATOR')).not.toContain('role:manage');
  });

  it('hasPermission checks resolved sets', () => {
    expect(hasPermission(['grn:view', 'rent:view'], 'grn:view')).toBe(true);
    expect(hasPermission(['grn:view'], 'user:manage')).toBe(false);
  });

  it('validates role definitions', () => {
    const valid = roleDefinitionSchema.safeParse({
      id: 'rol-123',
      key: 'BILLING_CLERK',
      displayName: 'Billing Clerk',
      description: 'Rent collection only',
      permissions: ['rent:view', 'rent:collect'],
      hasGlobalFacilityScope: false,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(valid.success).toBe(true);
    expect(createRoleSchema.safeParse({ key: 'bad-key', displayName: 'X', permissions: ['rent:view'] }).success).toBe(
      false,
    );
    expect(createRoleSchema.safeParse({ key: 'OK_KEY', displayName: 'X', permissions: [] }).success).toBe(false);
    expect(updateRoleSchema.safeParse({}).success).toBe(false);
  });

  it('user schemas accept roleId for custom roles and keep legacy role working', () => {
    const base = {
      fullName: 'Ramesh Kumar',
      username: 'ramesh.k',
      employeeId: 'EMP-1042',
      mobile: '9876543210',
      email: 'ramesh@coldstorage.com',
      facilityIds: ['fac-1'],
      temporaryPassword: 'TempPass123',
    };
    expect(createUser.safeParse({ ...base, role: 'OPERATOR' }).success).toBe(true);
    expect(createUser.safeParse({ ...base, roleId: 'rol-custom-1' }).success).toBe(true);
    expect(createUser.safeParse(base).success).toBe(false);
  });
});
