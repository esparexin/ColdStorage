import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface CommodityDoc extends Document {
  id: string;
  name: string;
  normalizedName: string;
  seasonDuration?: 'Seasonal' | 'Seasonal_3M';
  hamaliRate?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const commoditySchema = new Schema<CommodityDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    seasonDuration: { type: String, enum: ['Seasonal', 'Seasonal_3M'], default: 'Seasonal' },
    hamaliRate: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

export const CommodityModel: Model<CommodityDoc> =
  (mongoose.models.Commodity as Model<CommodityDoc>) || mongoose.model<CommodityDoc>('Commodity', commoditySchema);
