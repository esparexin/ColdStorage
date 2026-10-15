import { randomUUID } from 'node:crypto';
import { SessionModel } from '../../database/models/session.model.js';
import { hashOpaqueToken } from '../../utils/crypto.js';

export interface SessionEntity {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash?: string | null;
  expiresAt: Date;
  absoluteExpiresAt?: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Max concurrent active refresh sessions per user — oldest evicted beyond this. */
export const MAX_CONCURRENT_SESSIONS_PER_USER = 5;
/** Absolute session lifetime never extended by rotation (30 days). */
export const ABSOLUTE_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class SessionRepository {
  public async resetForTesting(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('resetForTesting can only be called in test environment');
    }
    if (SessionModel.db?.name === 'cold_storage') {
      throw new Error(
        'FATAL SAFETY VIOLATION: Cannot reset live database "cold_storage" during test execution.',
      );
    }
    await SessionModel.deleteMany({}).exec();
  }

  public async createSession(userId: string, refreshToken: string, expiresInDays = 7): Promise<SessionEntity> {
    const id = `sess-${randomUUID()}`;
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const now = Date.now();
    const expiresAt = new Date(now + expiresInDays * 86400 * 1000);
    const absoluteExpiresAt = new Date(now + ABSOLUTE_SESSION_LIFETIME_MS);
    const nowDate = new Date();

    const entity: SessionEntity = {
      id,
      userId,
      refreshTokenHash,
      previousRefreshTokenHash: null,
      expiresAt,
      absoluteExpiresAt,
      revokedAt: null,
      createdAt: nowDate,
      updatedAt: nowDate,
    };

    await SessionModel.create(entity as unknown as Record<string, unknown>);

    // Bound concurrent sessions: evict oldest beyond cap (prevents infinite accumulation).
    const activeCount = await SessionModel.countDocuments({ userId, revokedAt: null }).exec();
    if (activeCount > MAX_CONCURRENT_SESSIONS_PER_USER) {
      const excess = activeCount - MAX_CONCURRENT_SESSIONS_PER_USER;
      const oldest = await SessionModel.find({ userId, revokedAt: null })
        .sort({ createdAt: 1 })
        .limit(excess)
        .select('_id')
        .lean()
        .exec();
      const ids = oldest.map((d) => (d as unknown as { _id: unknown })._id);
      if (ids.length > 0) {
        await SessionModel.updateMany(
          { _id: { $in: ids } },
          { revokedAt: nowDate },
        ).exec();
      }
    }

    return entity;
  }

  public async findActiveSession(refreshToken: string): Promise<SessionEntity | null> {
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const now = new Date();

    const doc = await SessionModel.findOne({
      refreshTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .lean()
      .exec();
    if (!doc) return null;
    const entity = doc as unknown as SessionEntity;
    // Enforce absolute lifetime even if sliding expiry was extended.
    if (entity.absoluteExpiresAt && entity.absoluteExpiresAt <= now) return null;
    return entity;
  }

  /** Finds a session by its previous hash within grace window (reuse vs race disambiguation). */
  public async findByPreviousHash(refreshToken: string): Promise<SessionEntity | null> {
    const previousRefreshTokenHash = hashOpaqueToken(refreshToken);
    const doc = await SessionModel.findOne({ previousRefreshTokenHash })
      .lean()
      .exec();
    return doc ? (doc as unknown as SessionEntity) : null;
  }

  public async rotateSession(
    oldRefreshToken: string,
    newRefreshToken: string,
    expiresInDays = 7,
  ): Promise<SessionEntity | null> {
    const oldHash = hashOpaqueToken(oldRefreshToken);
    const newHash = hashOpaqueToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);
    const now = new Date();

    const doc = await SessionModel.findOneAndUpdate(
      {
        refreshTokenHash: oldHash,
        revokedAt: null,
        expiresAt: { $gt: now },
        $or: [{ absoluteExpiresAt: { $gt: now } }, { absoluteExpiresAt: { $exists: false } }],
      },
      {
        previousRefreshTokenHash: oldHash,
        refreshTokenHash: newHash,
        expiresAt: newExpiresAt,
        updatedAt: now,
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as SessionEntity) : null;
  }

  public async revokeSession(refreshToken: string): Promise<boolean> {
    const hash = hashOpaqueToken(refreshToken);
    const now = new Date();

    const res = await SessionModel.updateOne(
      { refreshTokenHash: hash, revokedAt: null },
      { revokedAt: now },
    ).exec();
    return res.modifiedCount > 0;
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date();
    await SessionModel.updateMany({ userId, revokedAt: null }, { revokedAt: now }).exec();
  }
}

export const sessionRepository = new SessionRepository();
