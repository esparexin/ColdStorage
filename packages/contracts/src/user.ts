import { z } from 'zod';
import { facilityIdSchema, indianMobileSchema } from './common.js';
import { roleSchema } from './permissions.js';

export { roleSchema, type Role } from './permissions.js';

export const userStatusSchema = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * P0-Decision 8: Admin sets initial temporary password; forced password change on first login.
 */
export const createUserSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dots, hyphens, and underscores'),
  employeeId: z.string().trim().min(1).max(40),
  mobile: indianMobileSchema,
  email: z.string().trim().email().max(160),
  role: roleSchema,
  facilityIds: z.array(facilityIdSchema).min(1, 'User must be assigned to at least one facility'),
  temporaryPassword: z.string().min(8).max(128),
});

export type CreateUser = z.infer<typeof createUserSchema>;

export const userSummarySchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  username: z.string().min(1),
  employeeId: z.string().min(1),
  mobile: z.string(),
  email: z.string().email(),
  role: roleSchema,
  facilityIds: z.array(facilityIdSchema),
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
  lastLoginAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;
