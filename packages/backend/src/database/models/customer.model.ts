import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface CustomerDoc extends Document {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
  gstin: string | null;
  facilityIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true, index: true },
    address: { type: String, trim: true, default: null },
    gstin: { type: String, trim: true, uppercase: true, default: null },
    facilityIds: [{ type: String, required: true, index: true }],
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const CustomerModel: Model<CustomerDoc> =
  (mongoose.models.Customer as Model<CustomerDoc>) || mongoose.model<CustomerDoc>('Customer', customerSchema);
