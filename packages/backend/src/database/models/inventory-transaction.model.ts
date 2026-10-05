import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BagType, InventoryReferenceType, InventoryTransactionType } from '@cold-storage/contracts';

export interface InventoryTransactionDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  /** Free-text chamber label copied from the owning GRN; capped at 20 characters. */
  chamber: string;
  commodityId: string;
  bagType: BagType;
  transactionType: InventoryTransactionType;
  /** Bag composition of this movement. The total is their sum and is never stored. */
  smallQuantity: number;
  bigQuantity: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

const inventoryTransactionSchema = new Schema<InventoryTransactionDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, index: true },
    chamber: { type: String, required: true, trim: true, maxlength: 20, index: true },
    commodityId: { type: String, required: true, index: true },
    bagType: { type: String, required: true, enum: ['S', 'B', 'S+B'] },
    transactionType: {
      type: String,
      required: true,
      enum: ['INWARD_PUTAWAY', 'OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'],
      index: true,
    },
    smallQuantity: { type: Number, required: true, min: 0 },
    bigQuantity: { type: Number, required: true, min: 0 },
    referenceType: {
      type: String,
      required: true,
      enum: ['PUT_AWAY', 'DELIVERY', 'DELIVERY_REVERSAL'],
    },
    referenceId: { type: String, required: true, index: true },
    notes: { type: String, trim: true, default: null },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

// A movement row that records no bags at all is meaningless and would silently contribute zero
// to every balance, so the invariant is enforced at the only write boundary that exists.
inventoryTransactionSchema.pre('validate', function assertMovementIsNotEmpty(next) {
  if ((this as InventoryTransactionDoc).smallQuantity + (this as InventoryTransactionDoc).bigQuantity <= 0) {
    next(new Error('InventoryTransaction must record at least one bag'));
    return;
  }
  next();
});

inventoryTransactionSchema.index({ facilityId: 1, grnId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, chamber: 1 });
inventoryTransactionSchema.index({ facilityId: 1, commodityId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, createdAt: -1 });
// The dashboard's Recent Activity query filters on facilityId AND
// transactionType, then sorts by createdAt. Without transactionType in the
// index MongoDB scans every facility transaction, filters, and sorts in
// memory — on the first-paint query of the landing page.
inventoryTransactionSchema.index({ facilityId: 1, transactionType: 1, createdAt: -1 });

export const InventoryTransactionModel: Model<InventoryTransactionDoc> =
  (mongoose.models.InventoryTransaction as Model<InventoryTransactionDoc>) ||
  mongoose.model<InventoryTransactionDoc>('InventoryTransaction', inventoryTransactionSchema);
