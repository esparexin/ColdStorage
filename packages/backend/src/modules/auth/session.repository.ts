import { randomUUID } from 'node:crypto';
import { SessionModel } from '../../database/models/session.model.js';
import { hashOpaqueToken } from '../../utils/crypto.js';

export interface SessionEntity {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
    const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);
    const now = new Date();

    const entity: SessionEntity = {
      id,
      userId,
      refreshTokenHash,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await SessionModel.create(entity);
    return entity;
  }

  public async findActiveSession(refreshToken: string): Promise<SessionEntity | null> {
    const refreshTokenHash = hashOpaqueToken(refreshToken);

    const doc = await SessionModel.findOne({
      refreshTokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
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
      { refreshTokenHash: oldHash, revokedAt: null, expiresAt: { $gt: now } },
      { refreshTokenHash: newHash, expiresAt: newExpiresAt, updatedAt: now },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as SessionEntity) : null;
  }

  public async revokeSession(refreshToken: string): Promise<boolean> {
    const hash = hashOpaqueToken(refreshToken);
    const now = new Date();

    const res = await SessionModel.updateOne({ refreshTokenHash: hash }, { revokedAt: now }).exec();
    return res.modifiedCount > 0;
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    const now = new Date();
    await SessionModel.updateMany({ userId, revokedAt: null }, { revokedAt: now }).exec();
  }
}

export const sessionRepository = new SessionRepository();
