import { SEASON_START_MONTH_INDEX } from './rent-extension.js';
import { resolveSeasonalElapsedPeriods } from './seasonal-periods.js';
import { seasonYearForInwardDate } from './rent-extension.js';
import type { RentType } from './grn-rent.js';
import { shouldEvaluateSeasonalBreakdown } from './outward-seasonal-transition.js';
import { toKolkataDateParts } from './date-kolkata.js';
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
  const parts = toKolkataDateParts(asOfDate);
  if (!parts) return null;
  const { month, year } = parts;
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
 * Authoritative SSOT: Determines if a target GRN belongs to the current running year
 * and is covered by an active/live subscription, with NO previous-season subscription
 * or closed subscription history requiring rent settlement.
 *
 * When true:
 * - Target GRN is exempt from monthly/seasonal rent calculation during merging.
 * - No Hybrid/Small/Big bag-type confirmation or quantity allocation is required.
 * - No rent rates are required for that target GRN.
 * - Only Hamali charges apply for the merge operation.
 */
export function isEligibleCurrentLiveSubscriptionGrn(params: {
  inwardDate?: Date | string | null;
  date?: Date | string | null;
  asOfDate?: Date | string | null;
  movementDate?: Date | string | null;
  rentType?: RentType | string | null;
  hasBilledExtensions?: boolean;
}): boolean {
  const inDate = params.inwardDate ?? params.date;
  const opDate = params.asOfDate ?? params.movementDate;
  if (!inDate || !opDate || params.hasBilledExtensions) return false;

  const inParts = toKolkataDateParts(inDate);
  const opParts = toKolkataDateParts(opDate);
  if (!inParts || !opParts) return false;

  const activeKey = resolveActiveSubscriptionPeriodKey(opDate);
  if (!activeKey) return false;

  if (params.rentType === 'Monthly') {
    return inParts.year === opParts.year;
  }

  const elapsed = resolveSeasonalElapsedPeriods(inDate, opDate);
  if (elapsed.length === 0) {
    return inParts.year >= opParts.year;
  }
  const uncompleted = resolveUncompletedPeriodKeys(inDate, opDate);
  const completedHistoricalPeriods = elapsed.filter((p) => !uncompleted.includes(p.key));
  if (completedHistoricalPeriods.length > 0) {
    return false;
  }

  const targetSeason = seasonYearForInwardDate(inDate);
  if (activeKey.startsWith('SEASON_')) {
    const activeYear = parseInt(activeKey.replace('SEASON_', ''), 10);
    return targetSeason === activeYear || inParts.year === opParts.year;
  }
  if (activeKey.startsWith('JANUARY_') || activeKey.startsWith('FEBRUARY_')) {
    return inParts.year === opParts.year;
  }

  return false;
}
