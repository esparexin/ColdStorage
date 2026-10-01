import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface PositionDoc extends Document {
  id: string;
  levelId: string;
  rackId: string;
  chamberId: string;
  facilityId: string;
  code: string;
  capacityBags: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const positionSchema = new Schema<PositionDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    levelId: { type: String, required: true, index: true },
    rackId: { type: String, required: true, index: true },
    chamberId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true },
    code: { type: String, required: true, trim: true },
    capacityBags: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

positionSchema.index({ levelId: 1, code: 1 }, { unique: true });

export const PositionModel: Model<PositionDoc> =
  (mongoose.models.Position as Model<PositionDoc>) || mongoose.model<PositionDoc>('Position', positionSchema);
