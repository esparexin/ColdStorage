import { Schema, model, type Document } from 'mongoose';
import type { PermissionKey } from '@cold-storage/contracts';

export interface IRoleDocument extends Document {
  id: string;
  key: string;
  displayName: string;
  description: string;
  permissions: PermissionKey[];
  hasGlobalFacilityScope: boolean;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRoleDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    key: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    permissions: { type: [String], required: true, default: [] },
    hasGlobalFacilityScope: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

export const RoleModel = model<IRoleDocument>('Role', roleSchema);
