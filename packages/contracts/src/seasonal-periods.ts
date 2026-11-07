import { SEASON_START_MONTH_INDEX, type ExtensionPeriod } from './rent-extension.js';
import { calculateHamaliAmount, deriveNetStorageRate } from './hamali.js';
import { shouldEvaluateSeasonalBreakdown } from './outward-seasonal-transition.js';
import { toKolkataDateParts } from './date-kolkata.js';
export { shouldEvaluateSeasonalBreakdown };

export interface SeasonalElapsedPeriod {
  key: string;
  label: string;
  period: ExtensionPeriod;
  seasonYear: number;
  calendarYear: number;
}

export interface OutwardPeriodRentBreakdown {
  periodKey: string;
  label: string;
  periodType: ExtensionPeriod;
  smallBags: number;
  bigBags: number;
  smallRate: number;
  bigRate: number;
  amount: number;
}

/**
 * Derives the completed and active seasonal/extension billing periods between
 * Inward Date and Outward Delivery Date according to Option A (Standard Seasonal Rule).
 *
 * Rules:
 * - March-December inward: First season covers through Dec 31 of seasonYear.
 * - January extension: January of subsequent year at Monthly rate.
 * - February extension: February of subsequent year at Monthly rate.
 * - Renewal season: Crossing March 1 triggers full season renewal charge.
 */
export function resolveSeasonalElapsedPeriods(
  inwardDate: Date | string,
  deliveryDate: Date | string,
): SeasonalElapsedPeriod[] {
  const inParts = toKolkataDateParts(inwardDate);
  const delParts = toKolkataDateParts(deliveryDate);
  if (!inParts || !delParts) return [];
  if (delParts.ymd < inParts.ymd) return [];

  const periods: SeasonalElapsedPeriod[] = [];
  const inYear = inParts.year;
  const inMonth = inParts.month;

  let currentSeasonYear = inMonth >= SEASON_START_MONTH_INDEX ? inYear : inYear - 1;

  if (inMonth === 0) {
    periods.push({
      key: `JANUARY_${inYear}`,
      label: `January ${inYear}`,
      period: 'JANUARY',
      seasonYear: currentSeasonYear,
      calendarYear: inYear,
    });
    if (delParts.ymd >= `${inYear}-02-01`) {
      periods.push({
        key: `FEBRUARY_${inYear}`,
        label: `February ${inYear}`,
        period: 'FEBRUARY',
        seasonYear: currentSeasonYear,
        calendarYear: inYear,
      });
    }
    currentSeasonYear = inYear;
    if (delParts.ymd >= `${inYear}-03-01`) {
      periods.push({
        key: `SEASON_${currentSeasonYear}`,
        label: `Season ${currentSeasonYear}`,
        period: 'SEASON',
        seasonYear: currentSeasonYear,
        calendarYear: inYear,
      });
    }
  } else if (inMonth === 1) {
    periods.push({
      key: `FEBRUARY_${inYear}`,
      label: `February ${inYear}`,
      period: 'FEBRUARY',
      seasonYear: currentSeasonYear,
      calendarYear: inYear,
    });
    currentSeasonYear = inYear;
    if (delParts.ymd >= `${inYear}-03-01`) {
      periods.push({
        key: `SEASON_${currentSeasonYear}`,
        label: `Season ${currentSeasonYear}`,
        period: 'SEASON',
        seasonYear: currentSeasonYear,
        calendarYear: inYear,
      });
    }
  } else {
    periods.push({
      key: `SEASON_${currentSeasonYear}`,
      label: `Season ${currentSeasonYear}`,
      period: 'SEASON',
      seasonYear: currentSeasonYear,
      calendarYear: currentSeasonYear,
    });
  }

  let yearCursor = currentSeasonYear;
  while (true) {
    if (delParts.ymd < `${yearCursor + 1}-01-01`) break;

    periods.push({
      key: `JANUARY_${yearCursor + 1}`,
      label: `January ${yearCursor + 1}`,
      period: 'JANUARY',
      seasonYear: yearCursor,
      calendarYear: yearCursor + 1,
    });

    if (delParts.ymd < `${yearCursor + 1}-02-01`) break;

    periods.push({
      key: `FEBRUARY_${yearCursor + 1}`,
      label: `February ${yearCursor + 1}`,
      period: 'FEBRUARY',
      seasonYear: yearCursor,
      calendarYear: yearCursor + 1,
    });

    if (delParts.ymd < `${yearCursor + 1}-03-01`) break;

    yearCursor += 1;
    periods.push({
      key: `SEASON_${yearCursor}`,
      label: `Season ${yearCursor}`,
      period: 'SEASON',
      seasonYear: yearCursor,
      calendarYear: yearCursor,
    });
  }

  return periods;
}

export interface OutwardSeasonalBreakdownInput {
  inwardDate: Date | string;
  deliveryDate: Date | string;
  smallBags: number;
  bigBags: number;
  seasonalRates: { small: number; big: number };
  monthlyRates: { small: number; big: number };
  excludePeriodKeys?: string[];
  hamaliRate?: number | null;
  /**
   * Whether seasonalRates passed in are gross inclusive rates that contain the hamali component.
   * Defaults to true if hamaliRate is positive, ensuring net storage rates are derived.
   */
  isRatesInclusiveOfHamali?: boolean;
}

export interface OutwardSeasonalBreakdownResult {
  periods: OutwardPeriodRentBreakdown[];
  /** Total Storage Rent (sum of all storage period amounts, without hamali) */
  totalRent: number;
  /** Explicit alias for total storage rent */
  storageRent: number;
  /** One-time inward handling charge: (smallBags + bigBags) * hamaliRate */
  hamaliAmount: number;
  /** Grand total payable: storageRent + hamaliAmount */
  totalAmount: number;
}

export function calculateOutwardSeasonalBreakdown(
  params: OutwardSeasonalBreakdownInput,
): OutwardSeasonalBreakdownResult {
  const elapsed = resolveSeasonalElapsedPeriods(params.inwardDate, params.deliveryDate);
  const periods: OutwardPeriodRentBreakdown[] = [];
  let totalRent = 0;

  const hasHamali = typeof params.hamaliRate === 'number' && Number.isFinite(params.hamaliRate) && params.hamaliRate > 0;
  const isInclusive = params.isRatesInclusiveOfHamali ?? hasHamali;

  // Deriving seasonal net storage rates (Option A Path 2)
  const seasonalSmall = isInclusive && hasHamali
    ? deriveNetStorageRate(params.seasonalRates.small, params.hamaliRate)
    : params.seasonalRates.small;
  const seasonalBig = isInclusive && hasHamali
    ? deriveNetStorageRate(params.seasonalRates.big, params.hamaliRate)
    : params.seasonalRates.big;

  for (const p of elapsed) {
    if (params.excludePeriodKeys?.includes(p.key)) continue;

    const isSeason = p.period === 'SEASON';
    const sRate = isSeason ? seasonalSmall : params.monthlyRates.small;
    const bRate = isSeason ? seasonalBig : params.monthlyRates.big;
    const amount = Number((params.smallBags * sRate + params.bigBags * bRate).toFixed(2));
    totalRent += amount;

    periods.push({
      periodKey: p.key,
      label: p.label,
      periodType: p.period,
      smallBags: params.smallBags,
      bigBags: params.bigBags,
      smallRate: sRate,
      bigRate: bRate,
      amount,
    });
  }

  const roundedStorageRent = Number(totalRent.toFixed(2));
  const totalBags = params.smallBags + params.bigBags;
  const hamaliAmount = hasHamali ? calculateHamaliAmount(totalBags, params.hamaliRate) : 0;
  const totalAmount = Number((roundedStorageRent + hamaliAmount).toFixed(2));

  return {
    periods,
    totalRent: roundedStorageRent,
    storageRent: roundedStorageRent,
    hamaliAmount,
    totalAmount,
  };
}

export interface HybridRateVisibility {
  showSeasonalRate: boolean;
  showMonthlyRate: boolean;
}

/** Maps a finalized rent extension to the elapsed-period key it already covers (period-dedup SSOT). */
export function extensionPeriodKey(seasonYear: number, period: ExtensionPeriod): string {
  return period === 'SEASON' ? `SEASON_${seasonYear}` : `${period}_${seasonYear + 1}`;
}

export function toExcludedPeriodKeys(extensions: Array<{ seasonYear: number; period: ExtensionPeriod }>): string[] {
  return extensions.map((e) => extensionPeriodKey(e.seasonYear, e.period));
}

export {
  resolveActiveSubscriptionPeriodKey,
  resolveUncompletedPeriodKeys,
  resolveMergeExcludedPeriodKeys,
  deriveHybridRateVisibility,
} from './merge-periods.js';

