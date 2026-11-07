import type { RentType } from './grn-rent.js';
import { toKolkataDateParts } from './date-kolkata.js';

export interface SeasonalTransitionParams {
  rentType?: RentType | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  asOfDate?: Date | string | null;
  hasSeasonalRates?: boolean;
}

/**
 * SSOT Helper: Determines whether an inward lot or outward delivery must evaluate seasonal breakdown logic.
 *
 * Rules:
 * 1. Seasonal / Seasonal_3M rent types always evaluate through seasonal logic.
 * 2. If a lot was entered as Monthly, but its storage period crosses from January/February
 *    into or past the March 1 seasonal boundary, and seasonal rates are configured,
 *    it transitions to Pre-Season Monthly + Full Seasonal billing.
 */
export function shouldEvaluateSeasonalBreakdown(params: SeasonalTransitionParams): boolean {
  if (params.rentType === 'Seasonal' || params.rentType === 'Seasonal_3M') return true;
  const targetDateVal = params.deliveryDate ?? params.asOfDate;
  if (params.rentType === 'Monthly' && params.inwardDate && targetDateVal && params.hasSeasonalRates !== false) {
    const inParts = toKolkataDateParts(params.inwardDate);
    const targetParts = toKolkataDateParts(targetDateVal);
    if (inParts && targetParts) {
      const inYear = inParts.year;
      const inMonth = inParts.month;
      const seasonStartYmd = `${inYear}-03-01`;
      if ((inMonth === 0 || inMonth === 1) && targetParts.ymd >= seasonStartYmd) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves the authoritative effective rent type for a GRN as of a given operational date.
 * If a lot entered under Monthly terms in January or February reaches March 1 (seasonal boundary),
 * its active rent type automatically transitions from Monthly to Seasonal.
 */
export function resolveEffectiveGrnRentType(params: {
  rentType?: RentType | null;
  inwardDate?: Date | string | null;
  asOfDate?: Date | string | null;
  hasSeasonalRates?: boolean;
}): RentType {
  const baseType = params.rentType ?? 'Seasonal';
  if (baseType !== 'Monthly') return baseType;
  const isTransitioned = shouldEvaluateSeasonalBreakdown({
    rentType: baseType,
    inwardDate: params.inwardDate,
    asOfDate: params.asOfDate ?? new Date(),
    hasSeasonalRates: params.hasSeasonalRates,
  });
  return isTransitioned ? 'Seasonal' : 'Monthly';
}

