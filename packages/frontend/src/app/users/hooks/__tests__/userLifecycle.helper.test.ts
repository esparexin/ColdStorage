import { describe, expect, it } from 'vitest';
import {
  updateUserSchema,
  type Role,
  type UserSummary,
} from '@cold-storage/contracts';
import {
  buildUserEditPatch,
  resolveUserSystemRole,
  toUserEditDraft,
  type UserEditDraft,
} from '../userEditPayload.helper';

describe('userLifecycle edit draft & payload helpers', () => {
  const mockUser: UserSummary = {
    id: 'usr-1',
    fullName: 'Anil Ambani',
    username: 'anil.a',
    employeeId: 'EMP-001',
    mobile: '9876543210',
    email: 'anil@coldstorage.local',
    role: 'OPERATOR',
    roleId: 'rol-custom-billing',
    facilityIds: ['fac-1'],
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('correctly maps UserSummary to UserEditDraft', () => {
    const draft = toUserEditDraft(mockUser);
    expect(draft.fullName).toBe('Anil Ambani');
    expect(draft.mobile).toBe('9876543210');
    expect(draft.email).toBe('anil@coldstorage.local');
    expect(draft.role).toBe('OPERATOR');
    expect(draft.roleId).toBe('rol-custom-billing');
    expect(draft.facilityIds).toEqual(['fac-1']);
  });

  it('resolves system role keys vs custom keys using resolveUserSystemRole', () => {
    expect(resolveUserSystemRole('SUPER_ADMIN')).toBe('SUPER_ADMIN');
    expect(resolveUserSystemRole('ADMIN')).toBe('ADMIN');
    expect(resolveUserSystemRole('OPERATOR')).toBe('OPERATOR');
    expect(resolveUserSystemRole('READ_ONLY')).toBe('READ_ONLY');
    expect(resolveUserSystemRole('CUSTOM_ROLE_KEY', 'OPERATOR')).toBe('OPERATOR');
    expect(resolveUserSystemRole(undefined, 'ADMIN')).toBe('ADMIN');
  });

  it('constructs a contract-compliant patch payload for custom roles (omits non-system role enum)', () => {
    const draft: UserEditDraft = {
      fullName: 'Anil Ambani',
      mobile: '9876543210',
      email: 'anil@coldstorage.local',
      role: 'BILLING_CLERK' as Role, // custom key
      roleId: 'rol-custom-billing',
      facilityIds: ['fac-1'],
    };

    const payload = buildUserEditPatch(draft);

    expect(payload.role).toBeUndefined();
    expect(payload.roleId).toBe('rol-custom-billing');

    // Contract validation must succeed
    const validation = updateUserSchema.safeParse(payload);
    expect(validation.success).toBe(true);
  });

  it('constructs a contract-compliant patch payload for system roles', () => {
    const draft: UserEditDraft = {
      fullName: 'Sunil Gavaskar',
      mobile: '9876543210',
      email: 'sunil@coldstorage.local',
      role: 'ADMIN',
      roleId: 'rol-system-admin',
      facilityIds: ['fac-1'],
    };

    const payload = buildUserEditPatch(draft);

    expect(payload.role).toBe('ADMIN');
    expect(payload.roleId).toBe('rol-system-admin');

    // Contract validation must succeed
    const validation = updateUserSchema.safeParse(payload);
    expect(validation.success).toBe(true);
  });
});
