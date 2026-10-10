import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface CommodityRateDoc extends Document {
  id: string;
  commodityId: string;
  rentType: 'Monthly' | 'Seasonal';
  smallRate: number;
  bigRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const commodityRateSchema = new Schema<CommodityRateDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    commodityId: { type: String, required: true, index: true },
    rentType: { type: String, required: true, enum: ['Monthly', 'Seasonal'], index: true },
    smallRate: { type: Number, required: true, min: 0 },
    bigRate: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  {
    timestamps: true,
  },
);

// One authoritative active rate row per (commodity, rent type): seasonal and
// monthly rates stay distinct even when numerically equal.
commodityRateSchema.index({ commodityId: 1, rentType: 1 }, { unique: true });

export const CommodityRateModel: Model<CommodityRateDoc> =
  (mongoose.models.CommodityRate as Model<CommodityRateDoc>) ||
  mongoose.model<CommodityRateDoc>('CommodityRate', commodityRateSchema);
