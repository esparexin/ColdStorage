import { z } from 'zod';

export const rentTypeSchema = z.enum(['Monthly', 'Seasonal']);
export type RentType = z.infer<typeof rentTypeSchema>;

// Complete 10-month rental period business constant for Seasonal subscriptions.
export const SEASONAL_RENT_MONTHS = 10;
export function rentMonthsForType(rentType: RentType): number | null {
  return rentType === 'Seasonal' ? SEASONAL_RENT_MONTHS : null;
}
/** Operator-facing month input: Monthly requires an explicit count; Seasonal is fixed. */
export const rentMonthsInputSchema = z
  .number({ invalid_type_error: 'Rent months must be a number' })
  .int('Rent months must be a whole number')
  .min(1, 'Rent months must be at least 1');
