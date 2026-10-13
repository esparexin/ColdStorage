import {
  SEASON_START_MONTH_INDEX,
  type ExtensionPeriod,
} from './rent-extension.js';
import type { RentType } from './grn-rent.js';

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
  const inD = new Date(inwardDate);
  const delD = new Date(deliveryDate);
  if (isNaN(inD.getTime()) || isNaN(delD.getTime()) || delD < inD) {
    return [];
  }

  const periods: SeasonalElapsedPeriod[] = [];
  const inYear = inD.getFullYear();
  const inMonth = inD.getMonth();

  let currentSeasonYear = inMonth >= SEASON_START_MONTH_INDEX ? inYear : inYear - 1;

  if (inMonth === 0) {
    periods.push({
      key: `JANUARY_${inYear}`,
      label: `January ${inYear}`,
      period: 'JANUARY',
      seasonYear: currentSeasonYear,
      calendarYear: inYear,
    });
    if (delD >= new Date(inYear, 1, 1)) {
      periods.push({
        key: `FEBRUARY_${inYear}`,
        label: `February ${inYear}`,
        period: 'FEBRUARY',
        seasonYear: currentSeasonYear,
        calendarYear: inYear,
      });
    }
    currentSeasonYear = inYear;
    if (delD >= new Date(inYear, SEASON_START_MONTH_INDEX, 1)) {
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
    if (delD >= new Date(inYear, SEASON_START_MONTH_INDEX, 1)) {
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
    const nextJanDate = new Date(yearCursor + 1, 0, 1);
    if (delD < nextJanDate) break;

    periods.push({
      key: `JANUARY_${yearCursor + 1}`,
      label: `January ${yearCursor + 1}`,
      period: 'JANUARY',
      seasonYear: yearCursor,
      calendarYear: yearCursor + 1,
    });

    const nextFebDate = new Date(yearCursor + 1, 1, 1);
    if (delD < nextFebDate) break;

    periods.push({
      key: `FEBRUARY_${yearCursor + 1}`,
      label: `February ${yearCursor + 1}`,
      period: 'FEBRUARY',
      seasonYear: yearCursor,
      calendarYear: yearCursor + 1,
    });

    const nextSeasonDate = new Date(yearCursor + 1, SEASON_START_MONTH_INDEX, 1);
    if (delD < nextSeasonDate) break;

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

export function calculateOutwardSeasonalBreakdown(params: {
  inwardDate: Date | string;
  deliveryDate: Date | string;
  smallBags: number;
  bigBags: number;
  seasonalRates: { small: number; big: number };
  monthlyRates: { small: number; big: number };
}): {
  periods: OutwardPeriodRentBreakdown[];
  totalRent: number;
} {
  const elapsed = resolveSeasonalElapsedPeriods(params.inwardDate, params.deliveryDate);
  const periods: OutwardPeriodRentBreakdown[] = [];
  let totalRent = 0;

  for (const p of elapsed) {
    const isSeason = p.period === 'SEASON';
    const sRate = isSeason ? params.seasonalRates.small : params.monthlyRates.small;
    const bRate = isSeason ? params.seasonalRates.big : params.monthlyRates.big;
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

  return {
    periods,
    totalRent: Number(totalRent.toFixed(2)),
  };
}

export interface ModernRateVisibility {
  showSeasonalRate: boolean;
  showMonthlyRate: boolean;
}

/**
 * Determines the visibility of manual pricing fields for Modern outward deliveries.
 * - Monthly Rent: Only Monthly Rate is shown (Scenario C).
 * - Seasonal Rent:
 *   - Same Year (within Mar-Dec): Only Seasonal Rate is shown (Scenario B).
 *   - Multi-Year / Extended (incurring Jan/Feb extensions): Both Seasonal Rate and Monthly Rate are shown (Scenario A).
 */
export function deriveModernRateVisibility(params: {
  rentType?: RentType | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
}): ModernRateVisibility {
  if (params.rentType === 'Monthly') {
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
