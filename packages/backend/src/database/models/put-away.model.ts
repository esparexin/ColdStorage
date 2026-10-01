import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface PutAwayAllocationItem {
  positionId: string;
  positionCode: string;
  bags: number;
}

export interface PutAwayAllocationDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  chamberId: string;
  items: PutAwayAllocationItem[];
  totalBags: number;
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
    chamberId: { type: String, required: true, index: true },
    items: [
      {
        positionId: { type: String, required: true },
        positionCode: { type: String, required: true },
        bags: { type: Number, required: true, min: 1 },
      },
    ],
    totalBags: { type: Number, required: true, min: 1 },
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
