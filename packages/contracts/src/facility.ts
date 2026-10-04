import { z } from 'zod';

/**
 * Facility is the tenancy and access-scope root. It is deliberately NOT part of a storage
 * hierarchy: chambers are free text (see `chamberTextSchema`), so Facility carries no child
 * structure and manages no capacity.
 *
 * Facility records are maintained by SUPER_ADMIN only, surfaced through Settings.
 */
export const facilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().default(true),
});

// `.strict()` so a stale or misspelled client key fails loudly instead of being silently
// stripped, which previously let a payload appear to save while dropping fields.
export const createFacilitySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(30),
    address: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateFacilitySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z.string().trim().min(1).max(30).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * `includeInactive` is opt-in. Operational callers leave it unset so deactivated facilities stop
 * appearing in selectors; the settings table sets it to keep showing them for reactivation.
 */
export const facilityQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type Facility = z.infer<typeof facilitySchema>;
export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;
export type FacilityQuery = z.infer<typeof facilityQuerySchema>;