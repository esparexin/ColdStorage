import mongoose, { Schema, type Document, type Model } from 'mongoose';

/**
 * Customer identity is a single free-text name (max 50 characters, special characters allowed).
 * `facilityIds` and `isActive` are system-owned: they drive multi-tenancy scoping and block
 * inward for a deactivated customer. Neither is collected from the operator.
 */
export interface CustomerDoc extends Document {
  id: string;
  name: string;
  facilityIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 50, index: true },
    facilityIds: [{ type: String, required: true, index: true }],
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const CustomerModel: Model<CustomerDoc> =
  (mongoose.models.Customer as Model<CustomerDoc>) ||
  mongoose.model<CustomerDoc>('Customer', customerSchema);
