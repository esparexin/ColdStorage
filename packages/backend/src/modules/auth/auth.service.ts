import type { AuthResponse, ChangePasswordInput, LoginInput, UserSummary } from '@cold-storage/contracts';
import { config } from '../../config.js';
import { generateToken, hashPassword, verifyPassword } from '../../utils/crypto.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { userService, type UserService } from '../users/user.service.js';

export class AuthService {
  constructor(
    private userRepo: UserRepository = userRepository,
    private userSvc: UserService = userService,
  ) {}

  public async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.userRepo.findByUsername(input.username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('User account is disabled');
    }

    const passwordValid = verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    await this.userRepo.updateLastLogin(user.id);

    const token = generateToken(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        facilityIds: user.facilityIds,
        mustChangePassword: user.mustChangePassword,
      },
      config.jwtSecret,
    );

    return {
      token,
      user: this.userSvc.toSummary(user),
      mustChangePassword: user.mustChangePassword,
    };
  }

  public async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<{ success: boolean; user: UserSummary }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentValid = verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new Error('Current password does not match');
    }

    const newHash = hashPassword(input.newPassword);
    const updated = await this.userRepo.updatePassword(userId, newHash);
    if (!updated) {
      throw new Error('Failed to update password');
    }

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
