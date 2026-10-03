import type { ChangePasswordInput, LoginInput, UserSummary } from '@cold-storage/contracts';
import { config } from '../../config.js';
import {
  generateAccessToken,
  generateOpaqueToken,
  hashPassword,
  verifyPassword,
} from '../../utils/crypto.js';
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
    const user = await this.userRepo.findByUsername(input.username);
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

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
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

    await this.userRepo.updateLastLogin(user.id);

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
    await this.sessionRepo.createSession(user.id, refreshToken, config.refreshTokenExpiryDays);

    await auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      resource: 'auth',
      details: { mustChangePassword: user.mustChangePassword },
    });

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

    const session = await this.sessionRepo.findActiveSession(currentRefreshToken);
    if (!session) {
      throw new Error('Invalid, expired, or revoked refresh token');
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User account is inactive or not found');
    }

    const newRefreshToken = generateOpaqueToken(32);
    await this.sessionRepo.rotateSession(
      currentRefreshToken,
      newRefreshToken,
      config.refreshTokenExpiryDays,
    );

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
