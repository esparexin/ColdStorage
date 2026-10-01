import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { SystemSettings } from '@cold-storage/contracts';

export interface SystemSettingsDoc
  extends Omit<Document, '_id'>, Omit<SystemSettings, 'gstin' | 'logoAssetId'> {
  _id: string;
  gstin: string | null;
  logoAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<SystemSettingsDoc>(
  {
    _id: { type: String, default: 'SYSTEM_SETTINGS' },
    orgName: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    contact: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, default: null },
    logoAssetId: { type: String, trim: true, default: null },
    printFooter: { type: String, trim: true, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    documentNumbering: {
      mode: {
        type: String,
        enum: ['FY_SEQUENTIAL', 'PENDING_CONFIRMATION'],
        default: 'FY_SEQUENTIAL',
      },
      grnPrefix: { type: String, default: 'GRN' },
      receiptPrefix: { type: String, default: 'RCPT' },
      challanPrefix: { type: String, default: 'CHL' },
      rentReceiptPrefix: { type: String, default: 'RRCPT' },
    },
    backupPolicy: {
      atlasRetentionDays: { type: Number, default: 7 },
      driveRetentionDays: { type: Number, default: 30 },
      driveBackupEnabled: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    _id: false,
  },
);

export const SystemSettingsModel: Model<SystemSettingsDoc> =
  (mongoose.models.SystemSettings as Model<SystemSettingsDoc>) ||
  mongoose.model<SystemSettingsDoc>('SystemSettings', systemSettingsSchema);
