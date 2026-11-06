import { SEASON_START_MONTH_INDEX } from './rent-extension.js';
import { resolveSeasonalElapsedPeriods } from './seasonal-periods.js';
import { seasonYearForInwardDate } from './rent-extension.js';
import type { RentType } from './grn-rent.js';
import { shouldEvaluateSeasonalBreakdown } from './outward-seasonal-transition.js';
import type { HybridRateVisibility } from './seasonal-periods.js';

/**
 * Determines the visibility of manual pricing fields for Hybrid outward deliveries.
 * - Monthly Rent: Only Monthly Rate is shown (Scenario C).
 * - Seasonal Rent:
 *   - Same Year (within Mar-Dec): Only Seasonal Rate is shown (Scenario B).
 *   - Multi-Year / Extended (incurring Jan/Feb extensions): Both Seasonal Rate and Monthly Rate are shown (Scenario A).
 */
export function deriveHybridRateVisibility(params: {
  rentType?: RentType | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  hasSeasonalRates?: boolean;
}): HybridRateVisibility {
  const isSeasonal = shouldEvaluateSeasonalBreakdown(params);
  if (!isSeasonal && params.rentType === 'Monthly') {
    return {
      showSeasonalRate: false,
      showMonthlyRate: true,
    };
  }

  if (!params.inwardDate || !params.deliveryDate) {
    return {
      showSeasonalRate: true,
      showMonthlyRate: false,
    };
  }

  const elapsed = resolveSeasonalElapsedPeriods(params.inwardDate, params.deliveryDate);
  const hasSeason = elapsed.some((p) => p.period === 'SEASON');
  const hasExtension = elapsed.some((p) => p.period === 'JANUARY' || p.period === 'FEBRUARY');

  return {
    showSeasonalRate: hasSeason || !hasExtension,
    showMonthlyRate: hasExtension,
  };
}

/**
 * Resolves the active / live running subscription period key as of an operational date.
 * - During March 1 – December 31 of year Y: The active period is `SEASON_${Y}`.
 * - During January 1 – January 31 of year Y: The active period is `JANUARY_${Y}` (extension of season Y - 1).
 * - During February 1 – February 28/29 of year Y: The active period is `FEBRUARY_${Y}` (extension of season Y - 1).
 */
export function resolveActiveSubscriptionPeriodKey(asOfDate: Date | string): string | null {
  const d = new Date(asOfDate);
  if (isNaN(d.getTime())) return null;
  const month = d.getMonth();
  const year = d.getFullYear();
  if (month >= SEASON_START_MONTH_INDEX) {
    return `SEASON_${year}`;
  } else if (month === 0) {
    return `JANUARY_${year}`;
  } else if (month === 1) {
    return `FEBRUARY_${year}`;
  }
  return null;
}

/**
 * Resolves period keys that are uncompleted / active as of movementDate,
 * which must strictly be excluded from pre-merge historical rent settlement.
 */
export function resolveUncompletedPeriodKeys(
  inwardDate: Date | string,
  movementDate: Date | string,
): string[] {
  const elapsed = resolveSeasonalElapsedPeriods(inwardDate, movementDate);
  if (elapsed.length === 0) return [];
  const activeKey = resolveActiveSubscriptionPeriodKey(movementDate);
  if (!activeKey) return [];
  const activeIndex = elapsed.findIndex((p) => p.key === activeKey);
  if (activeIndex === -1) return [];
  return elapsed.slice(activeIndex).map((p) => p.key);
}

/**
 * SSOT for deriving all excluded period keys during pre-merge rent assessment:
 * 1. Already billed extensions (`billedExtensionKeys`).
 * 2. Active running subscription period at `movementDate` (and any uncompleted future periods).
 * 3. Surviving target GRN active subscription coverage.
 */
export function resolveMergeExcludedPeriodKeys(params: {
  inwardDate: Date | string;
  movementDate: Date | string;
  targetGrnDate?: Date | string | null;
  billedExtensionKeys?: string[];
}): string[] {
  const { inwardDate, movementDate, targetGrnDate, billedExtensionKeys = [] } = params;
  const excluded = new Set<string>(billedExtensionKeys);

  // When merging into an existing target GRN:
  // 1. Exclude the uncompleted / active subscription period at movementDate
  // 2. Exclude periods covered by the surviving Target GRN's active subscription
  if (targetGrnDate) {
    const uncompleted = resolveUncompletedPeriodKeys(inwardDate, movementDate);
    for (const k of uncompleted) {
      excluded.add(k);
    }

    const targetSeason = seasonYearForInwardDate(targetGrnDate);
    const activeKey = resolveActiveSubscriptionPeriodKey(movementDate);
    if (activeKey?.startsWith('SEASON_')) {
      const activeSeasonYear = parseInt(activeKey.replace('SEASON_', ''), 10);
      if (activeSeasonYear >= targetSeason) {
        excluded.add(`SEASON_${activeSeasonYear}`);
      }
    }
  }

  return Array.from(excluded);
}

/**
 * SSOT for deriving excluded period keys during Ownership Transfer rent assessment.
 * Excludes already billed extensions and active uncompleted periods at movementDate.
 */
export function resolveTransferExcludedPeriodKeys(params: {
  inwardDate: Date | string;
  movementDate: Date | string;
  billedExtensionKeys?: string[];
}): string[] {
  const excluded = new Set<string>(params.billedExtensionKeys ?? []);
  const uncompleted = resolveUncompletedPeriodKeys(params.inwardDate, params.movementDate);
  for (const k of uncompleted) {
    excluded.add(k);
  }
  return Array.from(excluded);
}
