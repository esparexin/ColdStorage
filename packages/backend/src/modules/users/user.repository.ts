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
  /**
   * Secure bootstrap helper:
   * Only seeds initial admin if explicit environment credentials are provided.
   * Never hardcodes default production credentials.
   *
   * Recovery contract (disaster recovery only):
   * - Restart never overwrites an existing account; this returns the stored
   *   record untouched (password hash, mustChangePassword, updatedAt intact).
   * - The dangerous sequence is account deletion followed by recreation with a
   *   stale BOOTSTRAP_ADMIN_PASSWORD. After the first successful login + forced
   *   password change, clear BOOTSTRAP_ADMIN_PASSWORD from runtime config.
   * - To recover a lost Super Admin, set the bootstrap vars temporarily, restart
   *   once (account genuinely absent → recreated with mustChangePassword:true),
   *   log in, change the password, then clear the vars again.
   */
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
      facilityIds,
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
      facilityIds: user.facilityIds,
      status: user.status,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    });
    return user;
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const doc = await UserModel.findOne({ id: { $eq: sanitizeId(id) } }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByUsername(username: string): Promise<UserEntity | null> {
    const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const doc = await UserModel.findOne({ username: { $eq: normalized } }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const doc = await UserModel.findOne({ email: { $eq: normalized } }).lean().exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  /**
   * Minimal projection used by the authentication guard to confirm an account is still
   * authoritative. The JWT carries identity only; activation status always resolves from
   * MongoDB, which the architecture lock designates as the single session/identity SSOT.
   */
  public async findActivationStateById(id: string): Promise<UserEntity['status'] | null> {
    const gate = await this.findGateStateById(id);
    return gate ? gate.status : null;
  }

  /**
   * Gate state used by authentication guards. Both `status` and `mustChangePassword`
   * resolve from the canonical MongoDB record so a stale JWT claim can never force
   * an outdated password-change requirement (or bypass a fresh one).
   */
  public async findGateStateById(
    id: string,
  ): Promise<Pick<UserEntity, 'status' | 'mustChangePassword'> | null> {
    const doc = await UserModel.findOne({ id: { $eq: sanitizeId(id) } })
      .select('status mustChangePassword')
      .lean()
      .exec();
    if (!doc) {
      return null;
    }
    const entity = doc as unknown as UserEntity;
    return { status: entity.status, mustChangePassword: entity.mustChangePassword ?? false };
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

  /**
   * Writes a new password hash. `mustChangePassword` is explicit because the two callers
   * have opposite intent: a completed self-service change clears the flag, whereas an
   * Admin-issued temporary password must re-arm it for the next login (P0-Decision 8).
   */
  public async updatePassword(
    userId: string,
    newPasswordHash: string,
    mustChangePassword: boolean,
  ): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: { $eq: sanitizeId(userId) } },
      { passwordHash: newPasswordHash, mustChangePassword, updatedAt: new Date() },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  public async updateLastLogin(userId: string): Promise<void> {
    await UserModel.updateOne({ id: { $eq: sanitizeId(userId) } }, { lastLoginAt: new Date() }).exec();
  }

  public async updateStatus(userId: string, status: UserEntity['status']): Promise<UserEntity | null> {
    const doc = await UserModel.findOneAndUpdate(
      { id: { $eq: sanitizeId(userId) } },
      { status, updatedAt: new Date() },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  /**
   * Applies a whitelisted partial update. The caller owns validation and field selection, so
   * only these explicitly listed mutable attributes are ever written.
   */
  public async updateFields(
    userId: string,
    fields: Partial<
      Pick<UserEntity, 'fullName' | 'mobile' | 'email' | 'role' | 'facilityIds' | 'status'>
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
