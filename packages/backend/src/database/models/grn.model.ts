import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BagType, GrnStatus, RentType } from '@cold-storage/contracts';

export interface GrnDoc extends Document {
  id: string;
  facilityId: string;
  grnNumber: string;
  inwardReceiptNumber: string;
  date: Date;
  customerId: string;
  customerName: string;
  commodityId: string;
  commodityName: string;
  /** Free-text physical chamber label; capped at 20 characters. */
  chamber: string;
  bags: number;
  bagType: BagType;
  /** Per-bag weight (kg per individual bag). S uses smallBagWeight, B uses bigBagWeight, S+B uses both. */
  smallBagWeight: number | null;
  bigBagWeight: number | null;
  rentType: RentType;
  rentMonths: number | null;
  rentAmount: number;
  bagPrice: number | null;
  smallBagPrice: number | null;
  bigBagPrice: number | null;
  smallBags: number | null;
  bigBags: number | null;
  gpNumber: string | null;
  storageMark: string | null;
  partyMark: string | null;
  marks: string | null;
  vehicleNumber: string | null;
  remarks: string | null;
  status: GrnStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const grnSchema = new Schema<GrnDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, index: true },
    inwardReceiptNumber: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    commodityId: { type: String, required: true, index: true },
    commodityName: { type: String, required: true, trim: true },
    chamber: { type: String, required: true, trim: true, maxlength: 20, index: true },
    bags: { type: Number, required: true, min: 1 },
    bagType: { type: String, required: true, enum: ['S', 'B', 'S+B'] },
    smallBagWeight: { type: Number, default: null },
    bigBagWeight: { type: Number, default: null },
    rentType: { type: String, required: true, enum: ['Monthly', 'Seasonal'] },
    /** Seasonal is always the fixed 10-month period; Monthly carries the operator's count. */
    rentMonths: { type: Number, default: null },
    rentAmount: { type: Number, required: true, min: 0 },
    bagPrice: { type: Number, default: null },
    smallBagPrice: { type: Number, default: null },
    bigBagPrice: { type: Number, default: null },
    smallBags: { type: Number, default: null },
    bigBags: { type: Number, default: null },
    gpNumber: { type: String, trim: true, default: null },
    storageMark: { type: String, trim: true, maxlength: 20, default: null },
    partyMark: { type: String, trim: true, maxlength: 20, default: null },
    marks: { type: String, trim: true, default: null },
    vehicleNumber: { type: String, trim: true, uppercase: true, default: null },
    remarks: { type: String, trim: true, default: null },
    status: { type: String, required: true, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

grnSchema.index({ facilityId: 1, grnNumber: 1 }, { unique: true });
grnSchema.index({ facilityId: 1, inwardReceiptNumber: 1 }, { unique: true });
grnSchema.index({ facilityId: 1, date: -1 });
grnSchema.index({ customerId: 1, facilityId: 1 });

export const GrnModel: Model<GrnDoc> =
  (mongoose.models.Grn as Model<GrnDoc>) || mongoose.model<GrnDoc>('Grn', grnSchema);
