import { Schema, model, type Document } from 'mongoose';

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
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export const SessionModel = model<ISessionDocument>('Session', sessionSchema);
