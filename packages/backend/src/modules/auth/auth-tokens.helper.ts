import type { PermissionKey, UserSummary } from '@cold-storage/contracts';
import { config } from '../../config.js';
import { generateAccessToken } from '../../utils/crypto.js';
import { roleService } from '../roles/role.service.js';
import { userService } from '../users/user.service.js';
import type { UserEntity } from '../users/user.entity.js';

/** Resolves DB-authoritative permissions for token minting; fails closed. */
export async function resolveUserPermissions(user: UserEntity): Promise<PermissionKey[]> {
  const resolved = await roleService.resolvePermissionsForUser(user);
  return [...resolved.permissions];
}

/** Mints a short-lived access token carrying role identity + resolved permissions. */
export function mintAccessToken(
  user: UserEntity,
  permissions: PermissionKey[],
): string {
  return generateAccessToken(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      roleId: user.roleId ?? undefined,
      permissions,
      facilityIds: user.facilityIds,
      mustChangePassword: user.mustChangePassword,
    },
    config.jwtSecret,
    config.accessTokenExpirySeconds,
  );
}

/** Summarizes a user with its resolved permission set for login/refresh/me responses. */
export function toAuthenticatedSummary(user: UserEntity, permissions: PermissionKey[]): UserSummary {
  return { ...userService.toSummary(user), permissions: permissions as string[] };
}
