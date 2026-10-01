import { z } from 'zod';
import { roleSchema } from './permissions.js';
import { userSummarySchema } from './user.js';

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long').max(128),
});

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const tokenPayloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  role: roleSchema,
  facilityIds: z.array(z.string()),
  mustChangePassword: z.boolean(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export const authResponseSchema = z.object({
  token: z.string().min(1),
  user: userSummarySchema,
  mustChangePassword: z.boolean(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
