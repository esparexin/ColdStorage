import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface GroupDoc extends Document {
  id: string;
  facilityId: string;
  name: string;
  nameNormalized: string;
  remarks: string | null;
  customerId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<GroupDoc>(
  {
    id: { type: String, required: true, unique: true },
    facilityId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    nameNormalized: { type: String, required: true, trim: true, maxlength: 50 },
    remarks: { type: String, trim: true, maxlength: 500, default: null },
    customerId: { type: String, default: null },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

groupSchema.index({ facilityId: 1, nameNormalized: 1 }, { unique: true });
groupSchema.index({ facilityId: 1, customerId: 1 }, { sparse: true });
groupSchema.index({ facilityId: 1, createdAt: -1 });

export const GroupModel: Model<GroupDoc> =
  (mongoose.models.Group as Model<GroupDoc>) ||
  mongoose.model<GroupDoc>('Group', groupSchema);
