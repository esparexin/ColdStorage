import { z } from 'zod';
import { customerNameSchema } from './common.js';

/**
 * Customer identity is a single free-text name (max 50 characters, special characters allowed).
 *
 * `facilityIds` and `isActive` are NOT form fields: they are operational/system-owned state.
 * `facilityIds` is derived from the acting user's access scope at create time and drives
 * multi-tenancy scoping plus the GRN customer guard; `isActive` blocks inward for deactivated
 * customers. Neither is collected from the operator.
 */
export const customerSchema = z.object({
  id: z.string().min(1),
  name: customerNameSchema,
  facilityIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

/**
 * `.strict()` so a stale client still sending `mobile`/`address`/`gstin` gets an explicit
 * validation error instead of silently losing that data.
 */
export const createCustomerSchema = z
  .object({
    name: customerNameSchema,
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    name: customerNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const customerQuerySchema = z.object({
  facilityId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(50).optional(),
});

export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;