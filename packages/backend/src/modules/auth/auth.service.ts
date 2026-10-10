import type { ChangePasswordInput, LoginInput, UserSummary } from '@cold-storage/contracts';
import { config } from '../../config.js';
import {
  generateAccessToken,
  generateOpaqueToken,
  hashPassword,
  verifyPassword,
} from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';
import { auditService } from '../audit/audit.service.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { userService, type UserService } from '../users/user.service.js';
import { sessionRepository, type SessionRepository } from './session.repository.js';

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

export class AuthService {
  constructor(
    private userRepo: UserRepository = userRepository,
    private userSvc: UserService = userService,
    private sessionRepo: SessionRepository = sessionRepository,
  ) {}

  public async login(input: LoginInput): Promise<LoginResult> {
    const opStart = Date.now();
    const tm: Record<string, number> = {};
    let s = Date.now();
    const user = await this.userRepo.findByUsername(input.username);
    tm.findByUsernameMs = Date.now() - s;
    if (!user) {
      await auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'SECURITY',
        username: input.username,
        userRole: 'ANONYMOUS',
        resource: 'auth',
        details: { reason: 'USER_NOT_FOUND' },
      });
      throw new Error('Invalid credentials');
    }

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

    s = Date.now();
    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    tm.verifyPasswordMs = Date.now() - s;
    if (!passwordValid) {
      await auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'SECURITY',
        userId: user.id,
        username: user.username,
        userRole: user.role,
        resource: 'auth',
        details: { reason: 'PASSWORD_MISMATCH' },
      });
      throw new Error('Invalid credentials');
    }
    s = Date.now();
    await this.userRepo.updateLastLogin(user.id);
    tm.updateLastLoginMs = Date.now() - s;

    const accessToken = generateAccessToken(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        facilityIds: user.facilityIds,
        mustChangePassword: user.mustChangePassword,
      },
      config.jwtSecret,
      config.accessTokenExpirySeconds, // 15 minutes default
    );

    const refreshToken = generateOpaqueToken(32);
    s = Date.now();
    await this.sessionRepo.createSession(user.id, refreshToken, config.refreshTokenExpiryDays);
    tm.createSessionMs = Date.now() - s;
    s = Date.now();
    await auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      resource: 'auth',
      details: { mustChangePassword: user.mustChangePassword },
    });
    tm.auditSuccessMs = Date.now() - s;
    const totalMs = Date.now() - opStart;
    // Attribute login wall-clock to DB vs. crypto vs. audit; Argon2 ~100-500ms is normal.
    if (totalMs > 1000) logger.warn('auth.login slow', { ...tm, totalMs });

    return {
      accessToken,
      refreshToken,
      user: this.userSvc.toSummary(user),
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
    await this.sessionRepo.rotateSession(currentRefreshToken, newRefreshToken, config.refreshTokenExpiryDays);
    const rotateMs = Date.now() - s;

    const accessToken = generateAccessToken(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        facilityIds: user.facilityIds,
        mustChangePassword: user.mustChangePassword,
      },
      config.jwtSecret,
      config.accessTokenExpirySeconds,
    );

    const totalMs = Date.now() - opStart;
    if (totalMs > 1000) logger.warn('auth.refresh slow', { findSessionMs, findUserMs, rotateMs, totalMs });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: this.userSvc.toSummary(user),
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
    if (!user) {
      throw new Error('User not found');
    }
    return this.userSvc.toSummary(user);
  }
}

export const authService = new AuthService();
