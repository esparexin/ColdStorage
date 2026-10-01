import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface FacilityDoc extends Document {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const facilitySchema = new Schema<FacilityDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: null },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const FacilityModel: Model<FacilityDoc> =
  (mongoose.models.Facility as Model<FacilityDoc>) || mongoose.model<FacilityDoc>('Facility', facilitySchema);
