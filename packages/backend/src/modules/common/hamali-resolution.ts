import {
  calculateHamaliAmount,
  type ExtensionPeriod,
} from '@cold-storage/contracts';

/**
 * Hamali internal-only SSOT (Multi-Season Hamali Accounting).
 *
 * - Commodity-level `isHamaliApplicable` + `hamaliRate` is the master config,
 *   read live at calculation time.
 * - Inward Hamali is a one-time physical handling labor charge assessed on inward intake.
 * - Multi-season lifecycle: Hamali is charged once at intake. Passive monthly extensions
 *   and seasonal renewals never add new hamali charges, and the original unpaid
 *   inward hamali obligation is preserved across seasons until collected.
 * - Price Controller `CommodityRate.hamaliRate` is never consumed.
 * - One-time charge: `calculateHamaliAmount(bags, rate)` without rent months.
 */

export interface HamaliCommodityConfig {
  isHamaliApplicable?: boolean | null;
  hamaliRate?: number | null;
}

export function resolveEffectiveHamaliRate(
  inputOverride: number | null | undefined,
  commodity: HamaliCommodityConfig | null | undefined,
): number {
  if (inputOverride !== null && inputOverride !== undefined) {
    return inputOverride;
  }
  const isApplicable =
    commodity?.isHamaliApplicable !== undefined && commodity?.isHamaliApplicable !== null
      ? commodity.isHamaliApplicable
      : (commodity?.hamaliRate ?? 0) > 0;
  if (!isApplicable) return 0;
  return commodity?.hamaliRate ?? 0;
}

/**
 * Full inward Hamali for a GRN's intake bag count.
 * Preserved across monthly extensions and seasonal renewals without re-charging.
 * Uses snapshotted rate/amount when present on the GRN; falls back to live config
 * for legacy GRNs without inventing historical rates.
 */
export function computeFirstSeasonHamali(
  grnBags: number,
  commodity: HamaliCommodityConfig | null | undefined,
  _extensions?: Array<{ period: ExtensionPeriod }>,
  storedHamaliRate?: number | null,
  storedHamaliAmount?: number | null,
): number {
  if (storedHamaliAmount !== null && storedHamaliAmount !== undefined && storedHamaliAmount >= 0) {
    return storedHamaliAmount;
  }
  return calculateHamaliAmount(grnBags, resolveEffectiveHamaliRate(storedHamaliRate, commodity));
}
