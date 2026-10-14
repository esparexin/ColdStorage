import {
  calculateHamaliAmount,
  isFirstSeasonExtensions,
  type ExtensionPeriod,
} from '@cold-storage/contracts';

/**
 * Hamali internal-only SSOT (feat/hamali-first-season-internal).
 *
 * - Commodity-level `isHamaliApplicable` + `hamaliRate` is the master config,
 *   read live at calculation time.
 * - Hamali feeds first-season rent only; never stored on transaction records,
 *   never returned in API responses, never shown in transaction UI.
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
 * Full first-season Hamali for a GRN's inward bag count.
 * Zero when a finalized SEASON renewal exists (R2) or the commodity disables it.
 * Uses snapshotted rate/amount when present on the GRN; falls back to live config
 * for legacy GRNs without inventing historical rates.
 */
export function computeFirstSeasonHamali(
  grnBags: number,
  commodity: HamaliCommodityConfig | null | undefined,
  extensions: Array<{ period: ExtensionPeriod }>,
  storedHamaliRate?: number | null,
  storedHamaliAmount?: number | null,
): number {
  if (!isFirstSeasonExtensions(extensions)) return 0;
  if (storedHamaliAmount !== null && storedHamaliAmount !== undefined && storedHamaliAmount >= 0) {
    return storedHamaliAmount;
  }
  return calculateHamaliAmount(grnBags, resolveEffectiveHamaliRate(storedHamaliRate, commodity));
}
