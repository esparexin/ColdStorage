import { describe, expect, it } from 'vitest';
import type { RoleDefinition, UserSummary } from '@cold-storage/contracts';
import { countUsersByRole } from '../roleCounts.helper';

function role(id: string, key: string): RoleDefinition {
  return {
    id,
    key,
    displayName: key,
    description: '',
    permissions: ['dashboard:view'],
    hasGlobalFacilityScope: key === 'SUPER_ADMIN',
    isSystem: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

function user(id: string, overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id,
    fullName: `User ${id}`,
    username: `user-${id}`,
    employeeId: `EMP-${id}`,
    mobile: '9876543210',
    email: `user-${id}@coldstorage.com`,
    role: 'OPERATOR',
    facilityIds: ['fac-1'],
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('countUsersByRole', () => {
  it('counts each user exactly once for system roles', () => {
    const roles = [role('rol-system-admin', 'ADMIN'), role('rol-system-super-admin', 'SUPER_ADMIN')];
    const users = [
      user('1', { role: 'ADMIN', roleId: 'rol-system-admin' }),
      user('2', { role: 'ADMIN', roleId: 'rol-system-admin' }),
      user('3', { role: 'SUPER_ADMIN', roleId: 'rol-system-super-admin' }),
    ];
    const counts = countUsersByRole(users, roles);
    expect(counts.get('rol-system-admin')).toBe(2);
    expect(counts.get('rol-system-super-admin')).toBe(1);
    expect([...counts.values()].reduce((sum, n) => sum + n, 0)).toBe(3);
  });

  it('falls back to legacy role keys when roleId is absent', () => {
    const roles = [role('rol-system-operator', 'OPERATOR')];
    const users = [user('1', { role: 'OPERATOR', roleId: undefined })];
    const counts = countUsersByRole(users, roles);
    expect(counts.get('rol-system-operator')).toBe(1);
  });

  it('maps custom role ids without double counting', () => {
    const roles = [role('rol-custom-1', 'BILLING_CLERK')];
    const users = [
      user('1', { role: 'OPERATOR', roleId: 'rol-custom-1' }),
      user('2', { role: 'OPERATOR', roleId: 'rol-custom-1' }),
    ];
    const counts = countUsersByRole(users, roles);
    expect(counts.get('rol-custom-1')).toBe(2);
    expect([...counts.values()].reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});
