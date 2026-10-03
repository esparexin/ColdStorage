import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface PutAwayAllocationDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  /** Free-text chamber label copied from the owning GRN. */
  chamber: string;
  bags: number;
  notes: string | null;
  allocatedBy: string;
  allocatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const putAwayAllocationSchema = new Schema<PutAwayAllocationDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, index: true },
    chamber: { type: String, required: true, trim: true, maxlength: 20 },
    bags: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, default: null },
    allocatedBy: { type: String, required: true },
    allocatedAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

putAwayAllocationSchema.index({ facilityId: 1, grnId: 1 });
putAwayAllocationSchema.index({ facilityId: 1, allocatedAt: -1 });

export const PutAwayAllocationModel: Model<PutAwayAllocationDoc> =
  (mongoose.models.PutAwayAllocation as Model<PutAwayAllocationDoc>) ||
  mongoose.model<PutAwayAllocationDoc>('PutAwayAllocation', putAwayAllocationSchema);
