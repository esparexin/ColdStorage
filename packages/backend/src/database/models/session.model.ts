import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ISessionDocument extends Document {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISessionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
  },
);

// TTL: expired sessions auto-purge (F02). expireAfterSeconds 0 honours expiresAt.
// Compounds cover the two hot auth lookups without collection scans.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ refreshTokenHash: 1, revokedAt: 1 });

export const SessionModel: Model<ISessionDocument> =
  (mongoose.models.Session as Model<ISessionDocument>) ||
  mongoose.model<ISessionDocument>('Session', sessionSchema);
