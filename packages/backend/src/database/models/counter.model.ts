import mongoose, { Schema, type Document, type Model } from 'mongoose';

/**
 * `GRN` is retained for historical counter documents only. GR Numbers are now entered manually
 * as four digits and are no longer allocated from a counter.
 */
export type CounterType = 'GRN' | 'INWARD_RECEIPT' | 'CHALLAN' | 'RENT_RECEIPT';

export interface CounterDoc extends Document {
  facilityId: string;
  counterType: CounterType;
  financialYear: string;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

const counterSchema = new Schema<CounterDoc>(
  {
    facilityId: { type: String, required: true, index: true },
    counterType: {
      type: String,
      required: true,
      enum: ['GRN', 'INWARD_RECEIPT', 'CHALLAN', 'RENT_RECEIPT'],
      index: true,
    },
    financialYear: { type: String, required: true, index: true },
    lastSequence: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
  },
);

counterSchema.index({ facilityId: 1, counterType: 1, financialYear: 1 }, { unique: true });

export const CounterModel: Model<CounterDoc> =
  (mongoose.models.Counter as Model<CounterDoc>) ||
  mongoose.model<CounterDoc>('Counter', counterSchema);
