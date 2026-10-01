import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface CommodityDoc extends Document {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const commoditySchema = new Schema<CommodityDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const CommodityModel: Model<CommodityDoc> =
  (mongoose.models.Commodity as Model<CommodityDoc>) || mongoose.model<CommodityDoc>('Commodity', commoditySchema);
