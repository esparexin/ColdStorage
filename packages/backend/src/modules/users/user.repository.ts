import { randomUUID } from 'node:crypto';
import { UserModel } from '../../database/models/user.model.js';
import { hashPassword } from '../../utils/crypto.js';
import type { UserEntity } from './user.entity.js';

/**
 * Sanitize a user-supplied identifier before embedding in a MongoDB query.
 * Strips everything except alphanumeric chars, hyphens and underscores —
 * the only characters our application-generated IDs ever contain.
 */
function sanitizeId(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

export class UserRepository {
  /** Seeds initial admin only from explicit env creds; never overwrites existing. */
  public async bootstrapSuperAdminFromEnv(): Promise<UserEntity | null> {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const tempPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!username || !tempPassword) {
      return null;
    }

    const existing = await this.findByUsername(username);
    if (existing) {
      // Idempotent: existing credential state is authoritative. Never re-hash
      // or overwrite the stored password from the environment here.
      return existing;
    }

    const id = `usr-admin-${randomUUID()}`;
    const passwordHash = await hashPassword(tempPassword);
    const now = new Date();

    const rawFacilityIds = process.env.BOOTSTRAP_ADMIN_FACILITY_IDS ?? '';
    const facilityIds = rawFacilityIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const entity: UserEntity = {
      id,
      fullName: process.env.BOOTSTRAP_ADMIN_FULLNAME || 'System Administrator',
      username: username.toLowerCase().trim(),
      employeeId: process.env.BOOTSTRAP_ADMIN_EMPID || 'ADMIN-001',
      mobile: process.env.BOOTSTRAP_ADMIN_MOBILE || '9999999999',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || `${username}@coldstorage.local`,
      role: 'SUPER_ADMIN',
      roleId: 'rol-system-super-admin',
      facilityIds,
      status: 'ACTIVE',
      passwordHash,
      mustChangePassword: true, // P0-Decision 8: mandatory password change on first login
      lastLoginAt: null,
      failedAttempts: 0,
      lockoutUntil: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.createUser(entity);
  }

  public async resetForTesting(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('resetForTesting can only be called in test environment');
    }
    if (UserModel.db?.name === 'cold_storage') {
      throw new Error(
        'FATAL SAFETY VIOLATION: Cannot reset live database "cold_storage" during test execution.',
      );
    }
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
      roleId: user.roleId ?? null,
      facilityIds: user.facilityIds,
      status: user.status,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      failedAttempts: user.failedAttempts ?? 0,
      lockoutUntil: user.lockoutUntil ?? null,
      passwordChangedAt: user.passwordChangedAt ?? null,
    });
    return user;
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOne({ id: { $eq: sanitizeId(id) } })
      .select('+passwordHash')
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByUsername(username: string): Promise<UserEntity | null> {
    const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const doc = await UserModel.findOne({ username: { $eq: normalized } })
      .select('+passwordHash')
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const doc = await UserModel.findOne({ email: { $eq: normalized } })
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  /** DB-authoritative gate state for auth guards (status, password flag, role, scope). */
  public async findGateStateById(
    id: string,
  ): Promise<Pick<
    UserEntity,
    'status' | 'mustChangePassword' | 'role' | 'roleId' | 'facilityIds'
  > | null> {
    const doc = await UserModel.findOne({ id: { $eq: sanitizeId(id) } })
      .select('status mustChangePassword role roleId facilityIds')
      .lean()
      .exec();
    if (!doc) {
      return null;
    }
    const entity = doc as unknown as UserEntity;
    return {
      status: entity.status,
      mustChangePassword: entity.mustChangePassword ?? false,
      role: entity.role,
      roleId: (entity.roleId ?? null) as UserEntity['roleId'],
      facilityIds: entity.facilityIds ?? [],
    };
  }

  public async listUsers(page = 1, limit = 20): Promise<{ items: UserEntity[]; total: number }> {
    const offset = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      UserModel.find().sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean().exec(),
      UserModel.countDocuments().exec(),
    ]);
    return {
      items: docs as unknown as UserEntity[],
      total,
    };
  }

  /** Writes new hash; clears lockout; explicit flag for self-change vs admin temp. */
  public async updatePassword(
    userId: string,
    newPasswordHash: string,
    mustChangePassword: boolean,
  ): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: { $eq: sanitizeId(userId) } },
      {
        passwordHash: newPasswordHash,
        mustChangePassword,
        failedAttempts: 0,
        lockoutUntil: null,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      },
      { new: true },
    )
      .select('+passwordHash')
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async updateLastLogin(userId: string): Promise<void> {
    await UserModel.updateOne(
      { id: { $eq: sanitizeId(userId) } },
      { lastLoginAt: new Date(), failedAttempts: 0, lockoutUntil: null },
    ).exec();
  }

  /** Increments consecutive failed logins and arms exponential lockout after threshold. */
  public async recordFailedLogin(userId: string): Promise<{ failedAttempts: number; lockoutUntil: Date | null }> {
    const doc = await UserModel.findOne({ id: { $eq: sanitizeId(userId) } })
      .select('failedAttempts lockoutUntil')
      .lean()
      .exec();
    const attempts = ((doc as unknown as { failedAttempts?: number } | null)?.failedAttempts ?? 0) + 1;
    let lockoutUntil: Date | null = null;
    // After 5 failures, lock with exponential backoff: 5m, 15m, 30m, 60m (capped).
    if (attempts >= 5) {
      const step = Math.min(attempts - 5, 3);
      const minutes = [5, 15, 30, 60][step] ?? 60;
      lockoutUntil = new Date(Date.now() + minutes * 60 * 1000);
    }
    await UserModel.updateOne(
      { id: { $eq: sanitizeId(userId) } },
      { failedAttempts: attempts, lockoutUntil },
    ).exec();
    return { failedAttempts: attempts, lockoutUntil };
  }

  /**
   * Applies a whitelisted partial update. The caller owns validation and field selection, so
   * only these explicitly listed mutable attributes are ever written.
   */
  public async updateFields(
    userId: string,
    fields: Partial<
      Pick<
        UserEntity,
        'fullName' | 'mobile' | 'email' | 'role' | 'roleId' | 'facilityIds' | 'status'
      >
    >,
  ): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: { $eq: sanitizeId(userId) } },
      { ...fields, updatedAt: new Date() },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }
}

export const userRepository = new UserRepository();
