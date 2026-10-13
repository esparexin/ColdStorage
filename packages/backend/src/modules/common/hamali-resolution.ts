/**
 * Hamali rate resolution SSOT (Phase 1 — hamali-accounting-integrity).
 *
 * Approved rule:
 * - Commodity-level `isHamaliApplicable` + `hamaliRate` is the master config.
 * - Explicit per-GRN `input.hamaliRate` overrides commodity (API-only, no UI input).
 * - Price Controller `CommodityRate.hamaliRate` is intentionally ignored here so
 *   stale or conflicting controller rows can never affect billing. It remains
 *   persisted for compatibility but is never read by any charge path.
 * - Disabled (`isHamaliApplicable === false`) resolves to 0 for new charges;
 *   historical GRN `hamaliRate/hamaliAmount` values are never rewritten.
 * - One-time charge: callers multiply the resolved rate via
 *   `calculateHamaliAmount(bags, rate)` without rent months/season duration.
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
