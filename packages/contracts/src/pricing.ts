import { z } from 'zod';
import type { BagType } from './bags.js';
import { SEASONAL_RENT_MONTHS, type RentType } from './grn.js';

/**
 * Single Authoritative Bag Price & Rental Calculation SSOT.
 * Supports:
 * - Seasonal: Fixed 10 months (Original Inward Bags × Bag Price × 10).
 * - Monthly: Remaining Bags × Bag Price per billing cycle.
 * - S & B (Mixed): Preserves distinct small/big bag counts and prices.
 */
export const bagPriceSchema = z
  .number({ invalid_type_error: 'Bag price must be a number' })
  .positive('Bag price must be greater than zero')
  .max(100000, 'Bag price cannot exceed ₹100,000');

export type BagPrice = z.infer<typeof bagPriceSchema>;

export interface RentalCalculationInput {
  rentType: RentType;
  bags: number;
  bagType?: BagType | null;
  bagPrice?: number | null;
  smallBags?: number | null;
  bigBags?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  rentMonths?: number | null;
  rentAmount?: number | null;
}

/**
 * Authoritative rent calculation.
 * Derives the total rent obligation strictly from bag pricing and subscription term.
 */
export function calculateRentAmount(input: RentalCalculationInput): number {
  const months = input.rentType === 'Seasonal' ? SEASONAL_RENT_MONTHS : Math.max(1, input.rentMonths ?? 1);

  if (input.bagType === 'S+B' && (input.smallBagPrice != null || input.bigBagPrice != null)) {
    const sCount = input.smallBags ?? 0;
    const bCount = input.bigBags ?? 0;
    const sRate = input.smallBagPrice ?? input.bagPrice ?? 0;
    const bRate = input.bigBagPrice ?? input.bagPrice ?? 0;
    const monthlySum = sCount * sRate + bCount * bRate;
    return Number((monthlySum * months).toFixed(2));
  }

  if (typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    return Number((input.bags * input.bagPrice * months).toFixed(2));
  }

  // Fallback for historical records where rentAmount was manually entered
  return Number((input.rentAmount ?? 0).toFixed(2));
}

/**
 * Derives effective unit price per bag per month from an obligation.
 */
export function deriveBagPrice(input: {
  rentType: RentType;
  bags: number;
  bagPrice?: number | null;
  rentMonths?: number | null;
  rentAmount?: number | null;
}): number | null {
  if (typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    return input.bagPrice;
  }
  if (typeof input.rentAmount === 'number' && input.bags > 0) {
    const months = input.rentType === 'Seasonal' ? SEASONAL_RENT_MONTHS : Math.max(1, input.rentMonths ?? 1);
    return Number((input.rentAmount / (input.bags * months)).toFixed(2));
  }
  return null;
}

/**
 * Section 7: Monthly Charge = Remaining Bags × Applicable Bag Price.
 * Used for monthly cycle billing against remaining inward quantity.
 */
export function calculateMonthlyCharge(remainingBags: number, bagPrice: number): number {
  if (remainingBags <= 0 || bagPrice <= 0) return 0;
  return Number((remainingBags * bagPrice).toFixed(2));
}

/**
 * Derives the active billing cycle period based on the inward entry date.
 * For Seasonal: Fixed 10-Month Season.
 * For Monthly: Exact day-of-month cycle (e.g. 15 Apr 2026 – 14 May 2026).
 */
export function deriveBillingCycle(
  inwardDate: Date,
  rentType: RentType,
  asOfDate: Date = new Date(),
): string {
  if (rentType === 'Seasonal') {
    return 'Fixed 10-Month Season';
  }
  const inDate = new Date(inwardDate);
  const now = new Date(asOfDate);
  const day = inDate.getDate();

  let cycleStartYear = now.getFullYear();
  let cycleStartMonth = now.getMonth();

  if (now.getDate() < day) {
    cycleStartMonth -= 1;
  }

  const cycleStart = new Date(cycleStartYear, cycleStartMonth, day);
  const nextMonth = new Date(cycleStartYear, cycleStartMonth + 1, day);
  const cycleEnd = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
}
