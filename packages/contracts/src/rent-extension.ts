import { z } from 'zod';
import { rentalAmountSchema } from './common.js';

/**
 * Same-GRN recurring rent SSOT (approved business rules).
 *
 * Seasonal period = March–December (10 months, informational). The seasonal rate
 * is the total for the whole season: `bags × seasonal rate`, never `× 10`.
 * A Seasonal GRN that remains open past December accrues additive Monthly
 * periods for January and February at the monthly rate. Each subsequent season
 * is recorded as a separate `SEASON` period under the same GRN:
 *
 *   Total Due = Season(seasonYear) + Jan(seasonYear) + Feb(seasonYear) + …
 *
 * Season 1 lives on `Grn.rentAmount` (immutable); every later period lives in
 * `rentextensions`. Each period is a persisted, idempotent record keyed by
 * (facility, GRN, season year, period).
 */
export const extensionPeriodSchema = z.enum(['JANUARY', 'FEBRUARY', 'SEASON']);
export type ExtensionPeriod = z.infer<typeof extensionPeriodSchema>;

/** Seasonal cycle boundaries as zero-based month indexes. */
export const SEASON_START_MONTH_INDEX = 2; // March
export const SEASON_END_MONTH_INDEX = 11; // December

/**
 * Season year owning an inward date: March–December belong to the calendar year,
 * January–February belong to the prior season (their extensions were already due).
 */
export function seasonYearForInwardDate(inward: Date): number {
  const d = new Date(inward);
  return d.getMonth() >= SEASON_START_MONTH_INDEX ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Month-start snapshot instant for a billing period:
 * - JANUARY / FEBRUARY: Jan 01 / Feb 01 of the year following the season.
 * - SEASON: Mar 01 of the season year (seasonal renewal snapshot).
 * At local start-of-day. The charge is based on the bags remaining at this
 * instant — never on dispatch timing within the period.
 */
export function extensionSnapshotDate(seasonYear: number, period: ExtensionPeriod): Date {
  if (period === 'SEASON') return new Date(seasonYear, 2, 1);
  return period === 'JANUARY'
    ? new Date(seasonYear + 1, 0, 1)
    : new Date(seasonYear + 1, 1, 1);
}

/**
 * Extension charge for one full month: snapshot bags × applicable bag rate.
 * No proration — a month is billed whole once finalized (idempotent per GRN).
 */
export function calculateExtensionRent(snapshotBags: number, bagRate: number): number {
  if (!Number.isFinite(snapshotBags) || !Number.isFinite(bagRate)) return 0;
  if (snapshotBags <= 0 || bagRate <= 0) return 0;
  return Number((snapshotBags * bagRate).toFixed(2));
}

/** Final extension amount: authorized manual override wins, else the calculated value. */
export function resolveExtensionFinalAmount(
  calculatedAmount: number,
  manualAmount?: number | null,
): number {
  if (typeof manualAmount === 'number' && Number.isFinite(manualAmount) && manualAmount > 0) {
    return Number(manualAmount.toFixed(2));
  }
  return Number((calculatedAmount ?? 0).toFixed(2));
}

/**
 * Total rent due: initial seasonal obligation plus every finalized period
 * (seasonal renewals and January/February monthly periods).
 * With no additional periods this equals the original amount exactly, so
 * existing balances are unchanged by the recurring-period model.
 */
export function totalRentDue(
  originalRentAmount: number,
  extensionFinalAmounts: number[],
): number {
  const extensions = extensionFinalAmounts.reduce((sum, v) => sum + Number(v ?? 0), 0);
  return Number((Number(originalRentAmount ?? 0) + extensions).toFixed(2));
}

export const rentExtensionSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  seasonYear: z.number().int().min(2000).max(2100),
  period: extensionPeriodSchema,
  snapshotDate: z.coerce.date(),
  snapshotBags: z.number().int().min(0),
  bagRate: z.number().min(0),
  calculatedAmount: rentalAmountSchema,
  manualAmount: rentalAmountSchema.nullable().optional(),
  finalAmount: rentalAmountSchema,
  overrideReason: z.string().trim().min(5).max(500).nullable().optional(),
  overriddenBy: z.string().min(1).nullable().optional(),
  overriddenAt: z.coerce.date().nullable().optional(),
  finalizedBy: z.string().min(1),
  finalizedAt: z.coerce.date(),
  createdAt: z.coerce.date().optional(),
});

export type RentExtension = z.infer<typeof rentExtensionSchema>;

export const finalizeExtensionInputSchema = z.object({
  grnId: z.string().trim().min(1, 'GRN ID is required'),
  seasonYear: z
    .number({ invalid_type_error: 'Season year must be a number' })
    .int('Season year must be a whole year')
    .min(2000, 'Season year is too far in the past')
    .max(2100, 'Season year is too far in the future'),
  period: extensionPeriodSchema,
});

export type FinalizeExtensionInput = z.infer<typeof finalizeExtensionInputSchema>;

export const overrideExtensionInputSchema = z.object({
  manualAmount: z
    .number({ invalid_type_error: 'Manual amount must be a number' })
    .finite('Manual amount must be a finite number')
    .positive('Manual amount must be greater than zero'),
  reason: z
    .string()
    .trim()
    .min(5, 'An override reason of at least 5 characters is required')
    .max(500, 'Override reason cannot exceed 500 characters'),
});

export type OverrideExtensionInput = z.infer<typeof overrideExtensionInputSchema>;
