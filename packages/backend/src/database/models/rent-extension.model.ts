import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { ExtensionPeriod } from '@cold-storage/contracts';

export interface RentExtensionDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  seasonYear: number;
  period: ExtensionPeriod;
  snapshotDate: Date;
  snapshotBags: number;
  bagRate: number;
  calculatedAmount: number;
  manualAmount: number | null;
  finalAmount: number;
  overrideReason: string | null;
  overriddenBy: string | null;
  overriddenAt: Date | null;
  finalizedBy: string;
  finalizedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rentExtensionSchema = new Schema<RentExtensionDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, index: true },
    seasonYear: { type: Number, required: true, min: 2000, max: 2100 },
    period: { type: String, required: true, enum: ['JANUARY', 'FEBRUARY', 'SEASON'] },
    snapshotDate: { type: Date, required: true },
    snapshotBags: { type: Number, required: true, min: 0 },
    bagRate: { type: Number, required: true, min: 0 },
    calculatedAmount: { type: Number, required: true, min: 0 },
    manualAmount: { type: Number, default: null },
    finalAmount: { type: Number, required: true, min: 0 },
    overrideReason: { type: String, trim: true, default: null },
    overriddenBy: { type: String, default: null },
    overriddenAt: { type: Date, default: null },
    finalizedBy: { type: String, required: true },
    finalizedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

// One finalized record per GRN per month: finalization is idempotent and a
// month can never be billed twice, no matter how many dispatches occur in it.
rentExtensionSchema.index({ facilityId: 1, grnId: 1, seasonYear: 1, period: 1 }, { unique: true });
rentExtensionSchema.index({ facilityId: 1, grnId: 1 });

export const RentExtensionModel: Model<RentExtensionDoc> =
  (mongoose.models.RentExtension as Model<RentExtensionDoc>) ||
  mongoose.model<RentExtensionDoc>('RentExtension', rentExtensionSchema);
