import { auditService } from '../audit/audit.service.js';
import type { UserEntity } from '../users/user.entity.js';
import type { SessionRepository } from './session.repository.js';
import type { UserRepository } from '../users/user.repository.js';

export function isAccountLocked(user: UserEntity): boolean {
  return Boolean(user.lockoutUntil && new Date(user.lockoutUntil).getTime() > Date.now());
}

export async function throwIfLocked(user: UserEntity): Promise<void> {
  if (!isAccountLocked(user)) return;
  await auditService.log({
    eventType: 'AUTH_LOGIN_FAILED',
    severity: 'SECURITY',
    userId: user.id,
    username: user.username,
    userRole: user.role,
    resource: 'auth',
    details: { reason: 'ACCOUNT_LOCKED' },
  });
  throw new Error('Account temporarily locked due to too many failed attempts. Try again later.');
}

export async function recordInvalidPassword(
  userRepo: UserRepository,
  user: UserEntity,
): Promise<never> {
  const { failedAttempts, lockoutUntil } = await userRepo.recordFailedLogin(user.id);
  await auditService.log({
    eventType: 'AUTH_LOGIN_FAILED',
    severity: 'SECURITY',
    userId: user.id,
    username: user.username,
    userRole: user.role,
    resource: 'auth',
    details: { reason: 'PASSWORD_MISMATCH', failedAttempts },
  });
  if (lockoutUntil) {
    throw new Error('Account temporarily locked due to too many failed attempts. Try again later.');
  }
  throw new Error('Invalid credentials');
}

/** Grace window (10s) to absorb concurrent sibling refreshes (e.g. dual browser tabs). */
export const REFRESH_REUSE_GRACE_WINDOW_MS = 10000;

export async function handleRefreshReuse(
  sessionRepo: SessionRepository,
  presentedToken: string,
  user?: UserEntity | null,
): Promise<never> {
  const reused = await sessionRepo.findByPreviousHash(presentedToken);
  if (reused) {
    const isWithinGrace =
      reused.updatedAt &&
      Date.now() - new Date(reused.updatedAt).getTime() < REFRESH_REUSE_GRACE_WINDOW_MS;

    if (isWithinGrace) {
      await auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'INFO',
        userId: reused.userId,
        resource: 'auth',
        resourceId: reused.id,
        details: { reason: 'CONCURRENT_REFRESH_RACE_ABSORBED' },
      });
      throw new Error('Invalid, expired, or revoked refresh token');
    }

    const targetUserId = user?.id ?? reused.userId;
    await sessionRepo.revokeAllUserSessions(targetUserId);
    await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'SECURITY',
      userId: targetUserId,
      username: user?.username ?? 'unknown',
      userRole: user?.role ?? 'ANONYMOUS',
      resource: 'auth',
      details: { reason: 'REFRESH_TOKEN_REUSE_DETECTED', sessionId: reused.id },
    });
  } else {
    await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'SECURITY',
      userId: user?.id,
      username: user?.username,
      userRole: user?.role,
      resource: 'auth',
      details: { reason: 'REFRESH_TOKEN_REUSE_OR_RACE' },
    });
  }
  throw new Error('Invalid, expired, or revoked refresh token');
}
