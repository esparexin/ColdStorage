import { Schema, model, type Document } from 'mongoose';
import type { Role, UserStatus } from '@cold-storage/contracts';

export interface IUserDocument extends Document {
  id: string;
  fullName: string;
  username: string;
  employeeId: string;
  mobile: string;
  email: string;
  role: Role;
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
    employeeId: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'READ_ONLY'], required: true },
    facilityIds: { type: [String], required: true, default: [] },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export const UserModel = model<IUserDocument>('User', userSchema);
