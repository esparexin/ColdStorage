import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface LevelDoc extends Document {
  id: string;
  rackId: string;
  chamberId: string;
  facilityId: string;
  levelNumber: number;
  code: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const levelSchema = new Schema<LevelDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    rackId: { type: String, required: true, index: true },
    chamberId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true },
    levelNumber: { type: Number, required: true },
    code: { type: String, required: true, trim: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

levelSchema.index({ rackId: 1, levelNumber: 1 }, { unique: true });
levelSchema.index({ rackId: 1, code: 1 }, { unique: true });

export const LevelModel: Model<LevelDoc> =
  (mongoose.models.Level as Model<LevelDoc>) || mongoose.model<LevelDoc>('Level', levelSchema);
