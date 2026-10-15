import type { ChangePasswordInput, LoginInput, UserSummary } from '@cold-storage/contracts';
import { config } from '../../config.js';
import {
  generateOpaqueToken,
  hashPassword,
  verifyTimingMitigationPassword,
  verifyPassword,
} from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';
import { auditService } from '../audit/audit.service.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { userService, type UserService } from '../users/user.service.js';
import { sessionRepository, type SessionRepository } from './session.repository.js';
import {
  handleRefreshReuse,
  recordInvalidPassword,
  throwIfLocked,
} from './login-guard.helper.js';
import {
  mintAccessToken,
  resolveUserPermissions,
  toAuthenticatedSummary,
} from './auth-tokens.helper.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
  mustChangePassword: boolean;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
}

export interface AuthRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  constructor(
    private userRepo: UserRepository = userRepository,
    private userSvc: UserService = userService,
    private sessionRepo: SessionRepository = sessionRepository,
  ) {}

  public async login(input: LoginInput, ctx: AuthRequestContext = {}): Promise<LoginResult> {
    const opStart = Date.now();
    const user = await this.userRepo.findByUsername(input.username);
    if (!user) {
      // Constant-time mitigation for unknown users.
      await verifyTimingMitigationPassword(input.password);
      await auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'SECURITY',
        username: input.username,
        userRole: 'ANONYMOUS',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        resource: 'auth',
        details: { reason: 'USER_NOT_FOUND' },
      });
      throw new Error('Invalid credentials');
    }

    // Per-account lockout contains brute-force even when IPs rotate.
    await throwIfLocked(user);

    if (user.status !== 'ACTIVE') {
      await auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'WARN',
        userId: user.id,
        username: user.username,
        userRole: user.role,
        resource: 'auth',
        details: { reason: 'ACCOUNT_DISABLED' },
      });
      throw new Error('User account is disabled');
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      await recordInvalidPassword(this.userRepo, user);
    }
    await this.userRepo.updateLastLogin(user.id);
    const permissions = await resolveUserPermissions(user);
    const accessToken = mintAccessToken(user, permissions);
    const refreshToken = generateOpaqueToken(32);
    await this.sessionRepo.createSession(user.id, refreshToken, config.refreshTokenExpiryDays);
    await auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      resource: 'auth',
      details: { mustChangePassword: user.mustChangePassword },
    });
    const totalMs = Date.now() - opStart;
    if (totalMs > 1000) logger.warn('auth.login slow', { totalMs });

    return {
      accessToken,
      refreshToken,
      user: toAuthenticatedSummary(user, permissions),
      mustChangePassword: user.mustChangePassword,
    };
  }

  public async refresh(currentRefreshToken: string): Promise<RefreshResult> {
    if (!currentRefreshToken) {
      throw new Error('Refresh token is required');
    }

    const opStart = Date.now();
    let s = Date.now();
    const session = await this.sessionRepo.findActiveSession(currentRefreshToken);
    const findSessionMs = Date.now() - s;
    if (!session) {
      throw new Error('Invalid, expired, or revoked refresh token');
    }
    s = Date.now();
    const user = await this.userRepo.findById(session.userId);
    const findUserMs = Date.now() - s;
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User account is inactive or not found');
    }
    const newRefreshToken = generateOpaqueToken(32);
    s = Date.now();
    const rotated = await this.sessionRepo.rotateSession(
      currentRefreshToken,
      newRefreshToken,
      config.refreshTokenExpiryDays,
    );
    const rotateMs = Date.now() - s;
    // Governance F01: REFRESH_TOKEN_REUSE_OR_RACE guard (rotateSession null path) lives in login-guard.helper.
    if (!rotated) {
      await handleRefreshReuse(this.sessionRepo, currentRefreshToken, user);
    }

    const permissions = await resolveUserPermissions(user);
    const accessToken = mintAccessToken(user, permissions);

    const totalMs = Date.now() - opStart;
    if (totalMs > 1000) logger.warn('auth.refresh slow', { findSessionMs, findUserMs, rotateMs, totalMs });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: toAuthenticatedSummary(user, permissions),
    };
  }

  public async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const session = await this.sessionRepo.findActiveSession(refreshToken);
      if (session) {
        await auditService.log({
          eventType: 'AUTH_LOGOUT',
          severity: 'INFO',
          userId: session.userId,
          resource: 'auth',
          resourceId: session.id,
        });
      }
      await this.sessionRepo.revokeSession(refreshToken);
    }
  }

  public async logoutAll(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllUserSessions(userId);
    await auditService.log({
      eventType: 'AUTH_LOGOUT',
      severity: 'INFO',
      userId,
      resource: 'auth',
      details: { result: 'SUCCESS', scope: 'ALL_SESSIONS' },
    });
  }

  public async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<{ success: boolean; user: UserSummary }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentValid) {
      await auditService.log({
        eventType: 'AUTH_PASSWORD_CHANGE',
        severity: 'SECURITY',
        userId: user.id,
        username: user.username,
        userRole: user.role,
        resource: 'user',
        resourceId: user.id,
        details: { result: 'FAILURE', reason: 'CURRENT_PASSWORD_MISMATCH' },
      });
      throw new Error('Current password does not match');
    }

    const newHash = await hashPassword(input.newPassword);
    const updated = await this.userRepo.updatePassword(userId, newHash, false);
    if (!updated) {
      throw new Error('Failed to update password');
    }

    // Revoke previous sessions on password change for security
    await this.sessionRepo.revokeAllUserSessions(userId);

    await auditService.log({
      eventType: 'AUTH_PASSWORD_CHANGE',
      severity: 'INFO',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      resource: 'user',
      resourceId: user.id,
      details: { result: 'SUCCESS' },
    });

    return {
      success: true,
      user: this.userSvc.toSummary(updated),
    };
  }

  public async getMe(userId: string): Promise<UserSummary> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error('User not found');
    const permissions = await resolveUserPermissions(user);
    return toAuthenticatedSummary(user, permissions);
  }
}

export const authService = new AuthService();
