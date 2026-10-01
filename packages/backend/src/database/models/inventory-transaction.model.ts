import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BagType, InventoryReferenceType, InventoryTransactionType } from '@cold-storage/contracts';

export interface InventoryTransactionDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  chamberId: string;
  rackId: string;
  levelId: string;
  positionId: string;
  positionCode: string;
  customerId: string;
  commodityId: string;
  bagType: BagType;
  transactionType: InventoryTransactionType;
  quantity: number;
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
    chamberId: { type: String, required: true, index: true },
    rackId: { type: String, required: true, index: true },
    levelId: { type: String, required: true, index: true },
    positionId: { type: String, required: true, index: true },
    positionCode: { type: String, required: true, trim: true },
    customerId: { type: String, required: true, index: true },
    commodityId: { type: String, required: true, index: true },
    bagType: { type: String, required: true, enum: ['S', 'B', 'S+B'] },
    transactionType: {
      type: String,
      required: true,
      enum: ['INWARD_PUTAWAY', 'OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'],
      index: true,
    },
    quantity: { type: Number, required: true, min: 1 },
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

inventoryTransactionSchema.index({ facilityId: 1, positionId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, grnId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, chamberId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, commodityId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, customerId: 1 });
inventoryTransactionSchema.index({ facilityId: 1, createdAt: -1 });

export const InventoryTransactionModel: Model<InventoryTransactionDoc> =
  (mongoose.models.InventoryTransaction as Model<InventoryTransactionDoc>) ||
  mongoose.model<InventoryTransactionDoc>('InventoryTransaction', inventoryTransactionSchema);
