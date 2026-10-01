import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface DeliveryReversalDoc extends Document {
  id: string;
  facilityId: string;
  deliveryId: string;
  challanNumber: string;
  grnId: string;
  reason: string;
  reversedBy: string;
  reversedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deliveryReversalSchema = new Schema<DeliveryReversalDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    deliveryId: { type: String, required: true, unique: true, index: true },
    challanNumber: { type: String, required: true, trim: true },
    grnId: { type: String, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    reversedBy: { type: String, required: true },
    reversedAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

deliveryReversalSchema.index({ facilityId: 1, reversedAt: -1 });

export const DeliveryReversalModel: Model<DeliveryReversalDoc> =
  (mongoose.models.DeliveryReversal as Model<DeliveryReversalDoc>) ||
  mongoose.model<DeliveryReversalDoc>('DeliveryReversal', deliveryReversalSchema);
