import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { DeliveryStatus } from '@cold-storage/contracts';

export interface DeliveryChallanDoc extends Document {
  id: string;
  facilityId: string;
  challanNumber: string;
  date: Date;
  grnId: string;
  grnNumber: string;
  customerId: string;
  customerName: string;
  commodityId: string;
  commodityName: string;
  /** Free-text chamber label copied from the owning GRN. */
  chamber: string;
  bags: number;
  totalBags: number;
  openingBags: number;
  closingBags: number;
  marks: string | null;
  gpNumber: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  weight: number | null;
  remarks: string | null;
  status: DeliveryStatus;
  issuedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const deliveryChallanSchema = new Schema<DeliveryChallanDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    challanNumber: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, trim: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    commodityId: { type: String, required: true, index: true },
    commodityName: { type: String, required: true, trim: true },
    chamber: { type: String, required: true, trim: true, maxlength: 20 },
    bags: { type: Number, required: true, min: 1 },
    totalBags: { type: Number, required: true, min: 1 },
    openingBags: { type: Number, required: true, default: 0, min: 0 },
    closingBags: { type: Number, required: true, default: 0, min: 0 },
    marks: { type: String, trim: true, default: null },
    gpNumber: { type: String, trim: true, default: null },
    vehicleNumber: { type: String, trim: true, uppercase: true, default: null },
    driverName: { type: String, trim: true, default: null },
    weight: { type: Number, default: null },
    remarks: { type: String, trim: true, default: null },
    status: { type: String, required: true, enum: ['ISSUED', 'REVERSED'], default: 'ISSUED', index: true },
    issuedBy: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

deliveryChallanSchema.index({ facilityId: 1, challanNumber: 1 }, { unique: true });
deliveryChallanSchema.index({ facilityId: 1, grnId: 1 });
deliveryChallanSchema.index({ facilityId: 1, date: -1 });
deliveryChallanSchema.index({ customerId: 1, facilityId: 1 });

export const DeliveryChallanModel: Model<DeliveryChallanDoc> =
  (mongoose.models.DeliveryChallan as Model<DeliveryChallanDoc>) ||
  mongoose.model<DeliveryChallanDoc>('DeliveryChallan', deliveryChallanSchema);
