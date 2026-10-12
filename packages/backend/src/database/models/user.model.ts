import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { Role, UserStatus } from '@cold-storage/contracts';

export interface IUserDocument extends Document {
  id: string;
  fullName: string;
  username: string;
  employeeId: string;
  mobile: string;
  email: string;
  role: Role;
  roleId: string | null;
  facilityIds: string[];
  status: UserStatus;
  passwordHash: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    employeeId: { type: String, required: true, trim: true, maxlength: 40 },
    mobile: { type: String, required: true, trim: true, match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'] },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'], required: true },
    roleId: { type: String, default: null, index: true },
    facilityIds: { type: [String], required: true, default: [], index: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export const UserModel: Model<IUserDocument> =
  (mongoose.models.User as Model<IUserDocument>) || mongoose.model<IUserDocument>('User', userSchema);
