import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { BackupStatus, BackupType } from '@cold-storage/contracts';

export interface BackupLogDoc extends Document {
  id: string;
  backupType: BackupType;
  status: BackupStatus;
  sizeBytes: number;
  checksum: string | null;
  storageLocation: string;
  retentionExpiresAt: Date;
  triggeredBy: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const backupLogSchema = new Schema<BackupLogDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    backupType: { type: String, required: true, enum: ['MANUAL'], default: 'MANUAL' },
    status: {
      type: String,
      required: true,
      index: true,
      enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED', 'PRUNED'],
      default: 'IN_PROGRESS',
    },
    sizeBytes: { type: Number, required: true, default: 0, min: 0 },
    checksum: { type: String, default: null },
    storageLocation: { type: String, required: true },
    retentionExpiresAt: { type: Date, required: true, index: true },
    triggeredBy: { type: String, required: true, index: true },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

backupLogSchema.index({ status: 1, retentionExpiresAt: 1 });
backupLogSchema.index({ createdAt: -1 });

export const BackupLogModel: Model<BackupLogDoc> =
  (mongoose.models.BackupLog as Model<BackupLogDoc>) ||
  mongoose.model<BackupLogDoc>('BackupLog', backupLogSchema);
