import { z } from 'zod';

/**
 * Common locale and infrastructure validation schemas (P0-Decision 10: India defaults).
 */
export const indianMobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Mobile must be a valid 10-digit Indian number');

export const indianVehicleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$/, 'Invalid Indian vehicle registration format');

export const indianGstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid Indian GSTIN format');

export const facilityIdSchema = z.string().trim().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;
