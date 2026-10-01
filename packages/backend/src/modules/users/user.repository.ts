import { randomUUID } from 'node:crypto';
import { UserModel } from '../../database/models/user.model.js';
import { hashPassword } from '../../utils/crypto.js';
import type { UserEntity } from './user.entity.js';

export class UserRepository {
  /**
   * Secure bootstrap helper:
   * Only seeds initial admin if explicit environment credentials are provided.
   * Never hardcodes default production credentials.
   */
  public async bootstrapSuperAdminFromEnv(): Promise<UserEntity | null> {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const tempPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!username || !tempPassword) {
      return null;
    }

    const existing = await this.findByUsername(username);
    if (existing) {
      return existing;
    }

    const id = `usr-admin-${randomUUID()}`;
    const passwordHash = await hashPassword(tempPassword);
    const now = new Date();

    const entity: UserEntity = {
      id,
      fullName: process.env.BOOTSTRAP_ADMIN_FULLNAME || 'System Administrator',
      username: username.toLowerCase().trim(),
      employeeId: process.env.BOOTSTRAP_ADMIN_EMPID || 'ADMIN-001',
      mobile: process.env.BOOTSTRAP_ADMIN_MOBILE || '9999999999',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || `${username}@coldstorage.local`,
      role: 'SUPER_ADMIN',
      facilityIds: ['facility-primary'],
      status: 'ACTIVE',
      passwordHash,
      mustChangePassword: true, // P0-Decision 8: mandatory password change on first login
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.createUser(entity);
  }

  public async resetForTesting(): Promise<void> {
    await UserModel.deleteMany({}).exec();
  }

  public async createUser(user: UserEntity): Promise<UserEntity> {
    await UserModel.create({
      id: user.id,
      fullName: user.fullName,
      username: user.username.toLowerCase().trim(),
      employeeId: user.employeeId,
      mobile: user.mobile,
      email: user.email.toLowerCase().trim(),
      role: user.role,
      facilityIds: user.facilityIds,
      status: user.status,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    });
    return user;
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOne({ id }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByUsername(username: string): Promise<UserEntity | null> {
    const normalized = username.trim().toLowerCase();
    const doc = await UserModel.findOne({ username: normalized }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const doc = await UserModel.findOne({ email: normalized }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async listUsers(page = 1, limit = 20): Promise<{ items: UserEntity[]; total: number }> {
    const offset = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      UserModel.find().skip(offset).limit(limit).lean().exec(),
      UserModel.countDocuments().exec(),
    ]);
    return {
      items: docs as unknown as UserEntity[],
      total,
    };
  }

  public async updatePassword(userId: string, newPasswordHash: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: userId },
      { passwordHash: newPasswordHash, mustChangePassword: false, updatedAt: new Date() },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async updateLastLogin(userId: string): Promise<void> {
    await UserModel.updateOne({ id: userId }, { lastLoginAt: new Date() }).exec();
  }

  public async updateStatus(userId: string, status: UserEntity['status']): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: userId },
      { status, updatedAt: new Date() },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }
}

export const userRepository = new UserRepository();
