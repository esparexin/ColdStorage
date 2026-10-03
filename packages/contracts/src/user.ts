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

/**
 * Partial lifecycle update for an existing account. `username` is deliberately immutable
 * because it is the authentication key and the anchor referenced by audit records;
 * deactivation is expressed through `status` rather than record deletion so the immutable
 * audit trail (createdBy / updatedBy) keeps its referent.
 */
export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    mobile: indianMobileSchema,
    email: z.string().trim().email().max(160),
    role: roleSchema,
    facilityIds: z.array(facilityIdSchema).min(1, 'User must be assigned to at least one facility'),
    status: userStatusSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one updatable field must be provided',
  });

export type UpdateUser = z.infer<typeof updateUserSchema>;

/**
 * P0-Decision 8: only the Admin issues temporary passwords; the user is forced to change
 * it on first login. There is no self-service reset-link workflow in V1.
 */
export const resetUserPasswordSchema = z.object({
  temporaryPassword: z.string().min(8).max(128),
});

export type ResetUserPassword = z.infer<typeof resetUserPasswordSchema>;

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
