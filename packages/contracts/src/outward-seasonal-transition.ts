import { SEASON_START_MONTH_INDEX } from './rent-extension.js';
import type { RentType } from './grn-rent.js';

export interface SeasonalTransitionParams {
  rentType?: RentType | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  hasSeasonalRates?: boolean;
}

/**
 * SSOT Helper: Determines whether an outward delivery must evaluate seasonal breakdown logic.
 *
 * Rules:
 * 1. Seasonal / Seasonal_3M rent types always evaluate through seasonal logic.
 * 2. If a lot was entered as Monthly, but its storage period crosses from January/February
 *    into or past the March 1 seasonal boundary, and seasonal rates are configured,
 *    it transitions to Pre-Season Monthly + Full Seasonal billing.
 */
export function shouldEvaluateSeasonalBreakdown(params: SeasonalTransitionParams): boolean {
  if (params.rentType === 'Seasonal' || params.rentType === 'Seasonal_3M') return true;
  if (params.rentType === 'Monthly' && params.inwardDate && params.deliveryDate && params.hasSeasonalRates !== false) {
    const inD = new Date(params.inwardDate);
    const delD = new Date(params.deliveryDate);
    if (!isNaN(inD.getTime()) && !isNaN(delD.getTime())) {
      const inYear = inD.getFullYear();
      const inMonth = inD.getMonth();
      const marchFirst = new Date(inYear, SEASON_START_MONTH_INDEX, 1);
      if ((inMonth === 0 || inMonth === 1) && delD >= marchFirst) {
        return true;
      }
    }
  }
  return false;
}
