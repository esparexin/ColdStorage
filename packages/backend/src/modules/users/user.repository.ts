import { hashPassword } from '../../utils/crypto.js';
import type { UserEntity } from './user.entity.js';

export class UserRepository {
  private users: Map<string, UserEntity> = new Map();

  constructor() {
    this.seedSuperAdmin();
  }

  private seedSuperAdmin(): void {
    if (this.users.size === 0) {
      const id = 'usr-superadmin-01';
      this.users.set(id, {
        id,
        fullName: 'System Super Administrator',
        username: 'superadmin',
        employeeId: 'ADM-001',
        mobile: '9876543210',
        email: 'admin@coldstorage.local',
        role: 'SUPER_ADMIN',
        facilityIds: ['fac-primary'],
        status: 'ACTIVE',
        passwordHash: hashPassword('SuperAdmin123!'),
        mustChangePassword: true, // P0-Decision 8: admin-set temporary password, forced change
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  public resetForTesting(): void {
    this.users.clear();
    this.seedSuperAdmin();
  }

  public async createUser(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, user);
    return user;
  }

  public async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }

  public async findByUsername(username: string): Promise<UserEntity | null> {
    const normalized = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  public async listUsers(page = 1, limit = 20): Promise<{ items: UserEntity[]; total: number }> {
    const all = Array.from(this.users.values());
    const total = all.length;
    const offset = (page - 1) * limit;
    const items = all.slice(offset, offset + limit);
    return { items, total };
  }

  public async updatePassword(userId: string, newPasswordHash: string): Promise<UserEntity | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    user.passwordHash = newPasswordHash;
    user.mustChangePassword = false;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return user;
  }

  public async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLoginAt = new Date();
      this.users.set(userId, user);
    }
  }

  public async updateStatus(userId: string, status: UserEntity['status']): Promise<UserEntity | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    user.status = status;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return user;
  }
}

export const userRepository = new UserRepository();
