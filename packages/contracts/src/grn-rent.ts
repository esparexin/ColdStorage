import { z } from 'zod';

export const rentTypeSchema = z.enum(['Monthly', 'Seasonal', 'Seasonal_3M']);
export type RentType = z.infer<typeof rentTypeSchema>;

// Informational season lengths for Seasonal subscriptions.
// Never used as a multiplier: the seasonal rate is the total for the whole season.
export const SEASONAL_RENT_MONTHS = 10;
export const SEASONAL_3M_RENT_MONTHS = 3;

export function rentMonthsForType(rentType: RentType): number | null {
  if (rentType === 'Seasonal') return SEASONAL_RENT_MONTHS;
  if (rentType === 'Seasonal_3M') return SEASONAL_3M_RENT_MONTHS;
  return null;
}

export function isSeasonalRentType(rentType: RentType): boolean {
  return rentType === 'Seasonal' || rentType === 'Seasonal_3M';
}
/** Operator-facing month input: Monthly requires an explicit count; Seasonal is fixed. */
export const rentMonthsInputSchema = z
  .number({ invalid_type_error: 'Rent months must be a number' })
  .int('Rent months must be a whole number')
  .min(1, 'Rent months must be at least 1');
