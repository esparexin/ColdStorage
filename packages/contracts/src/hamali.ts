import { z } from 'zod';

export const hamaliRateSchema = z
  .number({ invalid_type_error: 'Hamali rate must be a number' })
  .min(0, 'Hamali rate cannot be negative')
  .max(10000, 'Hamali rate cannot exceed ₹10,000');

export type HamaliRate = z.infer<typeof hamaliRateSchema>;

/**
 * Authoritative Hamali labor charge calculation:
 * Total Bags × Hamali Rate per bag.
 * Bag-category agnostic: Small, Big, S+B, Hybrid, Mixed all calculate uniformly.
 *
 * Inward intake Hamali accounting:
 * - Commodity-level `isHamaliApplicable` + `hamaliRate` is the master config.
 * - At inward intake, `hamaliRate` and `hamaliAmount` are snapshotted onto the GRN
 *   record to freeze the labor obligation against future master rate edits.
 * - Outward delivery allocates a pro-rata share of this inward obligation.
 * - Internal movement merge records repacking labor on the movement record.
 * - One-time charge: never multiplied by rent months or season duration.
 */
export function calculateHamaliAmount(bags: number, hamaliRate?: number | null): number {
  if (!Number.isFinite(bags) || bags <= 0) return 0;
  if (typeof hamaliRate !== 'number' || !Number.isFinite(hamaliRate) || hamaliRate <= 0) return 0;
  return Number((bags * hamaliRate).toFixed(2));
}

/**
 * Proportional first-season allocation for a partial outward withdrawal (R1):
 * the full one-time amount (derived from the original inward bag count) is
 * shared pro-rata, and the cumulative allocation can never exceed it.
 * Never recomputed against remaining bags.
 */
export function allocateHamaliShare(
  fullAmount: number,
  withdrawnBags: number,
  totalBags: number,
  priorAllocated: number,
): number {
  if (!Number.isFinite(fullAmount) || fullAmount <= 0) return 0;
  if (!Number.isFinite(withdrawnBags) || withdrawnBags <= 0) return 0;
  if (!Number.isFinite(totalBags) || totalBags <= 0) return 0;
  const prior = Number.isFinite(priorAllocated) && priorAllocated > 0 ? priorAllocated : 0;
  const share = Number((fullAmount * (withdrawnBags / totalBags)).toFixed(2));
  return Math.min(share, Math.max(0, Number((fullAmount - prior).toFixed(2))));
}
