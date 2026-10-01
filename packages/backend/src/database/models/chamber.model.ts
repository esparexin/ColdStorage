import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ChamberDoc extends Document {
  id: string;
  facilityId: string;
  chamberNumber: string;
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chamberSchema = new Schema<ChamberDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    chamberNumber: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: null },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

chamberSchema.index({ facilityId: 1, chamberNumber: 1 }, { unique: true });

export const ChamberModel: Model<ChamberDoc> =
  (mongoose.models.Chamber as Model<ChamberDoc>) || mongoose.model<ChamberDoc>('Chamber', chamberSchema);
