import { randomUUID } from 'node:crypto';
import {
  type CreateUser,
  type ResetUserPassword,
  type UpdateUser,
  type UserSummary,
} from '@cold-storage/contracts';
import { auditService } from '../audit/audit.service.js';
import { sessionRepository } from '../auth/session.repository.js';
import { hashPassword } from '../../utils/crypto.js';
import type { UserEntity } from './user.entity.js';
import { userRepository, type UserRepository } from './user.repository.js';

export class UserService {
  constructor(private repo: UserRepository = userRepository) {}

  public toSummary(user: UserEntity): UserSummary {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      employeeId: user.employeeId,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      facilityIds: user.facilityIds,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async createUser(input: CreateUser): Promise<UserSummary> {
    const existingByUsername = await this.repo.findByUsername(input.username);
    if (existingByUsername) {
      throw new Error(`Username '${input.username}' is already in use`);
    }

    const existingByEmail = await this.repo.findByEmail(input.email);
    if (existingByEmail) {
      throw new Error(`Email '${input.email}' is already in use`);
    }

    const id = `usr-${randomUUID()}`;
    const now = new Date();

    const passwordHash = await hashPassword(input.temporaryPassword);

    const entity: UserEntity = {
      id,
      fullName: input.fullName,
      username: input.username,
      employeeId: input.employeeId,
      mobile: input.mobile,
      email: input.email,
      role: input.role,
      facilityIds: input.facilityIds,
      status: 'ACTIVE',
      passwordHash,
      mustChangePassword: true, // P0-Decision 8: forced password change on first login
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repo.createUser(entity);
    return this.toSummary(saved);
  }

  /**
   * Partial lifecycle update. Uniqueness of the mutable identity fields is re-checked before
   * writing, and any transition to DISABLED revokes live sessions so a disabled account can
   * never continue operating with a previously issued access token.
   */
  public async updateUser(
    id: string,
    input: UpdateUser,
    actingUserId: string,
  ): Promise<UserSummary | null> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      return null;
    }

    // A Super Admin must not be able to remove their own Super Admin authority, and the last
    // remaining Super Admin must not be demoted or disabled, because either would leave the
    // installation with nobody able to administer users.
    const losesSuperAdmin =
      existing.role === 'SUPER_ADMIN' &&
      ((input.role !== undefined && input.role !== 'SUPER_ADMIN') ||
        input.status === 'DISABLED');

    if (losesSuperAdmin) {
      if (existing.id === actingUserId) {
        throw new Error('An administrator cannot remove their own Super Admin authority');
      }
      const remaining = await this.repo.countActiveSuperAdmins(existing.id);
      if (remaining === 0) {
        throw new Error(
          'Cannot remove the last active Super Admin; promote another account first',
        );
      }
    }

    if (input.email && input.email.trim().toLowerCase() !== existing.email) {
      const duplicate = await this.repo.findByEmail(input.email);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`Email '${input.email}' is already in use`);
      }
    }

    const saved = await this.repo.updateFields(id, {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.facilityIds !== undefined ? { facilityIds: input.facilityIds } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    if (input.status === 'DISABLED' && existing.status !== 'DISABLED') {
      await sessionRepository.revokeAllUserSessions(id);
    }

    await auditService.log({
      eventType: 'USER_UPDATED',
      severity: 'INFO',
      userId: actingUserId,
      facilityId: null,
      resource: 'user',
      resourceId: id,
      details: {
        changedFields: Object.keys(input),
        previousRole: existing.role,
        nextRole: saved?.role ?? existing.role,
        previousStatus: existing.status,
        nextStatus: saved?.status ?? existing.status,
      },
    });

    return saved ? this.toSummary(saved) : null;
  }

  /**
   * P0-Decision 8: re-issues an Admin-supplied temporary password and re-arms the forced
   * change on next login. All existing sessions are revoked immediately.
   */
  public async resetUserPassword(
    id: string,
    input: ResetUserPassword,
    actingUserId: string,
  ): Promise<UserSummary | null> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      return null;
    }

    const passwordHash = await hashPassword(input.temporaryPassword);
    const saved = await this.repo.updatePassword(id, passwordHash, true);
    await sessionRepository.revokeAllUserSessions(id);

    await auditService.log({
      eventType: 'USER_PASSWORD_RESET',
      severity: 'SECURITY',
      userId: actingUserId,
      facilityId: null,
      resource: 'user',
      resourceId: id,
      details: { username: existing.username, mustChangePassword: true },
    });

    return saved ? this.toSummary(saved) : null;
  }

  public async listUsers(page = 1, limit = 20): Promise<{ items: UserSummary[]; total: number }> {
    const { items, total } = await this.repo.listUsers(page, limit);
    return {
      items: items.map((u) => this.toSummary(u)),
      total,
    };
  }

  public async getUserById(id: string): Promise<UserSummary | null> {
    const user = await this.repo.findById(id);
    return user ? this.toSummary(user) : null;
  }
}

export const userService = new UserService();