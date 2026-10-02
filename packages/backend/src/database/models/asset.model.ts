import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface AssetDoc extends Document {
  id: string;
  publicId: string;
  secureUrl: string;
  mimeType: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const assetSchema = new Schema<AssetDoc>(
  {
    id: { type: String, required: true, unique: true, index: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    secureUrl: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    format: { type: String, required: true, trim: true },
    bytes: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 },
    uploadedBy: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const AssetModel: Model<AssetDoc> =
  (mongoose.models.Asset as Model<AssetDoc>) ||
  mongoose.model<AssetDoc>('Asset', assetSchema);
