import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { InternalMovementType } from '@cold-storage/contracts';

export interface InternalMovementDoc extends Document {
  id: string;
  facilityId: string;
  movementType: InternalMovementType;
  movementDate: Date;
  targetGrnId: string | null;
  targetGrnNumber: string | null;
  sourceGrnIds: string[];
  sourceGrnNumbers: string[];
  totalBagsMoved: number;
  smallBagsMoved: number;
  bigBagsMoved: number;
  hamaliBags: number;
  hamaliRate?: number | null;
  hamaliCharge: number;
  hamaliCarried: number;
  referenceWeight?: number | null;
  grnId: string | null;
  grnNumber: string | null;
  fromCustomerId: string | null;
  fromCustomerName: string | null;
  toCustomerId: string | null;
  toCustomerName: string | null;
  financialSnapshot: {
    rentAmount: number;
    totalPaid: number;
    remainingBalance: number;
    paymentStatus: string;
    rentState?: string | null;
    hamaliAmount: number;
  };
  remarks: string | null;
  performedBy: string;
  createdAt: Date;
}

const internalMovementSchema = new Schema<InternalMovementDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    movementType: { type: String, required: true, enum: ['MERGE', 'TRANSFER_OWNERSHIP'], index: true },
    movementDate: { type: Date, required: true, index: true },
    targetGrnId: { type: String, default: null, index: true },
    targetGrnNumber: { type: String, default: null },
    sourceGrnIds: { type: [String], default: [] },
    sourceGrnNumbers: { type: [String], default: [] },
    totalBagsMoved: { type: Number, default: 0, min: 0 },
    smallBagsMoved: { type: Number, default: 0, min: 0 },
    bigBagsMoved: { type: Number, default: 0, min: 0 },
    // Legacy hamali columns: never written, never returned. No defaults so new
    // movements carry no hamali values; old values stay readable.
    hamaliBags: { type: Number, min: 0 },
    hamaliRate: { type: Number },
    hamaliCharge: { type: Number, min: 0 },
    hamaliCarried: { type: Number, min: 0 },
    referenceWeight: { type: Number, default: null },
    grnId: { type: String, default: null, index: true },
    grnNumber: { type: String, default: null },
    fromCustomerId: { type: String, default: null },
    fromCustomerName: { type: String, default: null },
    toCustomerId: { type: String, default: null },
    toCustomerName: { type: String, default: null },
    financialSnapshot: {
      rentAmount: { type: Number, required: true, min: 0 },
      totalPaid: { type: Number, required: true, min: 0 },
      remainingBalance: { type: Number, required: true, min: 0 },
      paymentStatus: { type: String, required: true },
      rentState: { type: String, default: null },
      // Legacy snapshot hamali: never written; old values stay readable.
      hamaliAmount: { type: Number, min: 0 },
    },
    remarks: { type: String, trim: true, maxlength: 500, default: null },
    performedBy: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

internalMovementSchema.index({ facilityId: 1, movementDate: -1 });
internalMovementSchema.index({ facilityId: 1, targetGrnId: 1 });
internalMovementSchema.index({ facilityId: 1, grnId: 1 });

export const InternalMovementModel: Model<InternalMovementDoc> =
  (mongoose.models.InternalMovement as Model<InternalMovementDoc>) ||
  mongoose.model<InternalMovementDoc>('InternalMovement', internalMovementSchema);
