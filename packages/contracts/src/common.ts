import { z } from 'zod';

/**
 * Common locale and infrastructure validation schemas (P0-Decision 10: India defaults).
 */
export const indianMobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Mobile must be a valid 10-digit Indian number');

/**
 * Normalizes Indian vehicle registration numbers by trimming, stripping
 * spaces and hyphens, and converting to uppercase.
 */
export function normalizeIndianVehicleNumber(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Valid Indian vehicle registration regex supporting:
 * 1. Standard format: State/UT (2 letters) + RTO (2 digits) + Series (0-3 letters) + Number (1-4 digits)
 * 2. Delhi single-digit RTO format: DL + 1 digit RTO + Series (1-3 letters) + Number (1-4 digits)
 * 3. Bharat Series (BH): Year (2 digits) + BH + 4 digits + Series (1-2 letters)
 */
export const INDIAN_VEHICLE_NORMALIZED_REGEX =
  /^(?:(?:AN|AP|AR|AS|BR|CG|CH|DD|DN|DL|GA|GJ|HR|HP|JH|JK|KA|KL|LA|LD|MP|MH|MN|ML|MZ|NL|OD|OR|PB|PY|RJ|SK|TN|TR|TS|UA|UK|UP|WB)[0-9]{2}[A-Z]{0,3}[0-9]{1,4}|DL[0-9][A-Z]{1,3}[0-9]{1,4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

export const INDIAN_VEHICLE_ERROR_MESSAGE =
  'Vehicle registration must be in standard Indian format (e.g. UP32AA1111, DL1CAA1111, or 22BH1234AA)';

export function isValidIndianVehicleNumber(raw?: string | null): boolean {
  if (!raw) return false;
  return INDIAN_VEHICLE_NORMALIZED_REGEX.test(normalizeIndianVehicleNumber(raw));
}

export const indianVehicleSchema = z
  .string()
  .transform((val) => normalizeIndianVehicleNumber(val))
  .pipe(
    z.string().regex(INDIAN_VEHICLE_NORMALIZED_REGEX, INDIAN_VEHICLE_ERROR_MESSAGE)
  );

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