import {
  SYSTEM_ROLE_KEYS,
  type Role,
  type UpdateUser,
  type UserSummary,
} from '@cold-storage/contracts';

export interface UserEditDraft {
  fullName: string;
  mobile: string;
  email: string;
  role: Role;
  roleId?: string;
  facilityIds: string[];
}

export function toUserEditDraft(user: UserSummary): UserEditDraft {
  return {
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    roleId: user.roleId,
    facilityIds: [...user.facilityIds],
  };
}

export function resolveUserSystemRole(
  key: string | undefined,
  fallback: Role = 'OPERATOR',
): Role {
  if (key && (SYSTEM_ROLE_KEYS as readonly string[]).includes(key)) {
    return key as Role;
  }
  return fallback;
}

export function buildUserEditPatch(draft: UserEditDraft): Partial<UpdateUser> {
  const isSystemRole = (SYSTEM_ROLE_KEYS as readonly string[]).includes(draft.role);
  return {
    fullName: draft.fullName.trim(),
    mobile: draft.mobile.trim(),
    email: draft.email.trim(),
    ...(isSystemRole ? { role: draft.role } : {}),
    ...(draft.roleId ? { roleId: draft.roleId } : {}),
    facilityIds: draft.facilityIds,
  };
}

