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

export const facilityIdSchema = z.string().trim().min(1).max(64);

/**
 * Chamber is a free-text physical location label captured at inward time. It is NOT a managed
 * storage entity: there is no rack/level/position beneath it and no capacity or occupancy is
 * tracked against it. Operators type whatever label their site uses (e.g. "A", "CH-01").
 */
export const chamberTextSchema = z
  .string()
  .trim()
  .min(1, 'Chamber is required')
  .max(20, 'Chamber cannot exceed 20 characters');

/** Customer identity is a single free-text name. Special characters are allowed. */
export const customerNameSchema = z
  .string()
  .trim()
  .min(1, 'Customer name is required')
  .max(50, 'Customer name cannot exceed 50 characters');

/**
 * Monetary amount entered by an operator. Rejects NaN/Infinity outright so a non-numeric
 * string coerced by a permissive caller can never become a stored rent obligation.
 */
export const rentalAmountSchema = z
  .number({ invalid_type_error: 'Rental amount must be a number' })
  .finite('Rental amount must be a finite number')
  .min(0, 'Rental amount must be zero or greater');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;