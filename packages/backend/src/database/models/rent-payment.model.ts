import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { PaymentMode } from '@cold-storage/contracts';

export interface RentPaymentDoc extends Document {
  id: string;
  facilityId: string;
  grnId: string;
  grnNumber: string;
  receiptNumber: string;
  amountPaid: number;
  paymentMode: PaymentMode;
  paymentDate: Date;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const rentPaymentSchema = new Schema<RentPaymentDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    facilityId: { type: String, required: true, index: true },
    grnId: { type: String, required: true, index: true },
    grnNumber: { type: String, required: true, index: true },
    receiptNumber: { type: String, required: true, index: true },
    amountPaid: { type: Number, required: true, min: 0.01 },
    paymentMode: { type: String, required: true, enum: ['Cash', 'UPI'], index: true },
    paymentDate: { type: Date, required: true, index: true },
    notes: { type: String, default: null },
    createdBy: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for fast ledger aggregation and deterministic sorting
rentPaymentSchema.index({ grnId: 1, facilityId: 1 });
rentPaymentSchema.index({ facilityId: 1, receiptNumber: 1 }, { unique: true });
rentPaymentSchema.index({ facilityId: 1, paymentDate: -1, _id: -1 });

// Immutability enforcement (P12 Architecture Lock — identical to P10 AuditLogModel)
function throwImmutabilityError(operation: string): never {
  throw new Error(
    `RENT_PAYMENT_IMMUTABLE: ${operation} operation is strictly prohibited on confirmed RentPayment`,
  );
}

rentPaymentSchema.pre('updateOne', function () {
  throwImmutabilityError('updateOne');
});
rentPaymentSchema.pre('updateMany', function () {
  throwImmutabilityError('updateMany');
});
rentPaymentSchema.pre('findOneAndUpdate', function () {
  throwImmutabilityError('findOneAndUpdate');
});
rentPaymentSchema.pre('replaceOne', function () {
  throwImmutabilityError('replaceOne');
});
rentPaymentSchema.pre('deleteOne', function () {
  throwImmutabilityError('deleteOne');
});
rentPaymentSchema.pre('deleteMany', function () {
  throwImmutabilityError('deleteMany');
});
rentPaymentSchema.pre('findOneAndDelete', function () {
  throwImmutabilityError('findOneAndDelete');
});

rentPaymentSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(
      new Error(
        'RENT_PAYMENT_IMMUTABLE: Modification of existing RentPayment document is prohibited',
      ),
    );
    return;
  }
  next();
});

export const RentPaymentModel: Model<RentPaymentDoc> =
  (mongoose.models.RentPayment as Model<RentPaymentDoc>) ||
  mongoose.model<RentPaymentDoc>('RentPayment', rentPaymentSchema);
