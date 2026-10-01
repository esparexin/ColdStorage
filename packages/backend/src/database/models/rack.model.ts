import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface RackDoc extends Document {
  id: string;
  chamberId: string;
  facilityId: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rackSchema = new Schema<RackDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    chamberId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true },
    code: { type: String, required: true, trim: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

rackSchema.index({ chamberId: 1, code: 1 }, { unique: true });

export const RackModel: Model<RackDoc> =
  (mongoose.models.Rack as Model<RackDoc>) || mongoose.model<RackDoc>('Rack', rackSchema);
