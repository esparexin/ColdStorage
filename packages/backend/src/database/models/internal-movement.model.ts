import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BagType, InternalMovementType, OutwardBagCategory } from '@cold-storage/contracts';

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
  // Informational bag-type / bag-category confirmation echo (challan-column mirror).
  sourceBagType?: BagType | null;
  sourceBagCategory?: OutwardBagCategory | null;
  sourceQuantity?: number | null;
  sourceBagPrice?: number | null;
  sourceSeasonalBagPrice?: number | null;
  sourceMonthlyBagPrice?: number | null;
  /**
   * Labor charges for physical repacking during GRN merge.
   * Written by merge-grn-movement.helper when repacking hamali applies (hamaliCharge > 0).
   * Omitted during ownership transfers.
   */
  hamaliBags: number;
  hamaliRate?: number | null;
  hamaliCharge: number;
  /** Net variance between repacked bag quantity and original consolidated source bag quantity. */
  repackVariance?: number;
  /** Total consolidated source bags prior to repacking. */
  repackSourceBags?: number;
  /** @deprecated Legacy column: retained for historical document reads; never written. */
  hamaliCarried?: number;
  referenceWeight?: number | null;
  idempotencyKey?: string | null;
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
    // Informational confirmation echo: no defaults, never billed.
    sourceBagType: { type: String, enum: ['S', 'B', 'S+B', 'S/B', 'Hybrid'], default: null },
    sourceBagCategory: { type: String },
    sourceQuantity: { type: Number, min: 0 },
    sourceBagPrice: { type: Number, min: 0 },
    sourceSeasonalBagPrice: { type: Number, min: 0 },
    sourceMonthlyBagPrice: { type: Number, min: 0 },
    // Hamali columns for repacking labor during merge (written when hamaliCharge > 0).
    hamaliBags: { type: Number, min: 0 },
    hamaliRate: { type: Number, min: 0, default: 0 },
    hamaliCharge: { type: Number, min: 0 },
    repackVariance: { type: Number, default: 0 },
    repackSourceBags: { type: Number, min: 0 },
    // @deprecated Legacy column: retained for historical rows; never written.
    hamaliCarried: { type: Number, min: 0 },
    referenceWeight: { type: Number, default: null },
    idempotencyKey: { type: String, trim: true, default: null, index: true },
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
      // Labor charges for physical repacking during merge (written when hamaliCharge > 0).
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
