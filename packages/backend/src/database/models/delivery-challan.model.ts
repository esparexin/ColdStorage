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
  /** Informational bag type label ('S', 'B', 'S+B', or 'S/B') from the source GRN. */
  bagType?: string | null;
  /** Bag composition dispatched. The total is their sum and is never stored. */
  smallBags: number;
  bigBags: number;
  marks: string | null;
  gpNumber: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  weight: number | null;
  remarks: string | null;
  rentCharge?: number;
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
    bagType: { type: String, trim: true, default: null },
    smallBags: { type: Number, required: true, min: 0 },
    bigBags: { type: Number, required: true, min: 0 },
    marks: { type: String, trim: true, default: null },
    gpNumber: { type: String, trim: true, default: null },
    vehicleNumber: { type: String, trim: true, uppercase: true, default: null },
    driverName: { type: String, trim: true, default: null },
    weight: { type: Number, default: null },
    remarks: { type: String, trim: true, default: null },
    rentCharge: { type: Number, default: 0 },
    status: { type: String, required: true, enum: ['ISSUED', 'REVERSED'], default: 'ISSUED', index: true },
    issuedBy: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

// A challan that dispatched nothing is not a movement record. Guarded here so no caller can
// write one, which would otherwise net to zero in every balance and hide a lost delivery.
deliveryChallanSchema.pre('validate', function assertChallanIsNotEmpty(next) {
  const doc = this as DeliveryChallanDoc;
  if (doc.smallBags + doc.bigBags <= 0) {
    next(new Error('DeliveryChallan must dispatch at least one bag'));
    return;
  }
  next();
});

deliveryChallanSchema.index({ facilityId: 1, challanNumber: 1 }, { unique: true });
deliveryChallanSchema.index({ facilityId: 1, grnId: 1 });
deliveryChallanSchema.index({ facilityId: 1, date: -1 });
deliveryChallanSchema.index({ customerId: 1, facilityId: 1 });

export const DeliveryChallanModel: Model<DeliveryChallanDoc> =
  (mongoose.models.DeliveryChallan as Model<DeliveryChallanDoc>) ||
  mongoose.model<DeliveryChallanDoc>('DeliveryChallan', deliveryChallanSchema);
