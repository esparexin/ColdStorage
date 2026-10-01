import { randomUUID } from 'node:crypto';
import type { CreateUser, UserSummary } from '@cold-storage/contracts';
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
      passwordHash: hashPassword(input.temporaryPassword),
      mustChangePassword: true, // P0-Decision 8: forced password change on first login
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repo.createUser(entity);
    return this.toSummary(saved);
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
