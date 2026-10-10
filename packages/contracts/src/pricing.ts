import { z } from 'zod';
import type { BagType } from './bags.js';
import type { RentType } from './grn-rent.js';

/**
 * Bag Price & Rental Calculation SSOT.
 * Seasonal = Bags × Seasonal Rate (whole-season total, never ×10).
 * Monthly = Bags × Monthly Rate × months. S+B keeps small/big split.
 */
export const bagPriceSchema = z
  .number({ invalid_type_error: 'Bag price must be a number' })
  .positive('Bag price must be greater than zero')
  .max(100000, 'Bag price cannot exceed ₹100,000');

export type BagPrice = z.infer<typeof bagPriceSchema>;

export interface CanonicalBagRate {
  small: number;
  big: number;
}

/** Canonical reference rates for Small and Big bags under Seasonal and Monthly rent types. */
export const CANONICAL_BAG_RATES: Record<RentType, CanonicalBagRate> = {
  Seasonal: { small: 10, big: 15 },
  Monthly: { small: 10, big: 15 },
};

export interface OutwardRateOverride { smallBagPrice?: number | null; bigBagPrice?: number | null; bagPrice?: number | null; }
/** Outward effective rates SSOT: GRN agreed rates override canonical; charge and display share this. */
export function resolveOutwardRates(rentType: RentType, o?: OutwardRateOverride | null): CanonicalBagRate {
  const r = CANONICAL_BAG_RATES[rentType] ?? { small: 10, big: 15 };
  return { small: o?.smallBagPrice ?? o?.bagPrice ?? r.small, big: o?.bigBagPrice ?? o?.bagPrice ?? r.big };
}

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

/** Authoritative rent calculation: Seasonal ignores `rentMonths` (whole-season total). */
export function calculateRentAmount(input: RentalCalculationInput): number {
  const isSeasonal = input.rentType === 'Seasonal';
  // Seasonal total ignores rentMonths; Monthly bills per billable month.
  const months = isSeasonal ? 1 : Math.max(1, input.rentMonths ?? 1);

  if (input.bagType === 'S+B' && (input.smallBagPrice != null || input.bigBagPrice != null)) {
    const sCount = input.smallBags ?? 0;
    const bCount = input.bigBags ?? 0;
    const sRate = input.smallBagPrice ?? input.bagPrice ?? 0;
    const bRate = input.bigBagPrice ?? input.bagPrice ?? 0;
    return Number(((sCount * sRate + bCount * bRate) * months).toFixed(2));
  }

  if (typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    return Number((input.bags * input.bagPrice * months).toFixed(2));
  }

  // Fallback for historical records where rentAmount was manually entered
  return Number((input.rentAmount ?? 0).toFixed(2));
}

/** Seasonal renewal under the same GRN: Applicable Bags × Seasonal Rate. */
export function calculateSeasonalRenewal(input: RentalCalculationInput): number {
  return calculateRentAmount({ ...input, rentType: 'Seasonal' });
}

/**
 * Derives the effective per-bag rate from an obligation.
 * - Seasonal: seasonal total rate = rentAmount / bags (whole-season total).
 * - Monthly: monthly rate = rentAmount / (bags × months).
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
    if (input.rentType === 'Seasonal') {
      return Number((input.rentAmount / input.bags).toFixed(2));
    }
    const months = Math.max(1, input.rentMonths ?? 1);
    return Number((input.rentAmount / (input.bags * months)).toFixed(2));
  }
  return null;
}

/** Monthly Charge = Remaining Bags × Applicable Bag Price (single cycle). */
export function calculateMonthlyCharge(remainingBags: number, bagPrice: number): number {
  if (remainingBags <= 0 || bagPrice <= 0) return 0;
  return Number((remainingBags * bagPrice).toFixed(2));
}

/** Billing cycle label: Seasonal is fixed; Monthly is the day-of-month cycle. */
export function deriveBillingCycle(
  inwardDate: Date,
  rentType: RentType,
  asOfDate: Date = new Date(),
): string {
  if (rentType === 'Seasonal') {
    return 'Season total (Mar–Dec)';
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

export interface MovementSnapshot {
  date: Date;
  type: string;
  deliveredBags: number;
  closingBags: number;
}

export interface OccupancyCalculationInput {
  grnId: string;
  grnNumber: string;
  inwardDate: Date;
  totalBags: number;
  bagRate: number;
  movements: MovementSnapshot[];
  /** End boundary; defaults to current date. */
  asOfDate?: Date;
  /** Billing uses opening occupancy per cycle ('full_month'); 'daily_prorate' is opt-in. */
  prorationMode?: 'full_month' | 'daily_prorate';
}

/** Monthly occupancy: per-cycle opening bags × rate, stops at 0 remaining. */
export function calculateMonthlyOccupancy(input: OccupancyCalculationInput) {
  const { grnId, grnNumber, inwardDate, totalBags, bagRate, movements } = input;
  if (totalBags <= 0 || bagRate <= 0) return [];

  const inDate = new Date(inwardDate);
  const asOf = input.asOfDate ? new Date(input.asOfDate) : new Date();
  const periods = [];

  const sortedMovements = [...movements].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let currentOpening = totalBags;
  let cycleStart = new Date(inDate);
  let periodIndex = 1;

  while (cycleStart <= asOf && currentOpening > 0) {
    const nextCycleMonth = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate());
    const cycleEnd = new Date(nextCycleMonth.getTime() - 24 * 60 * 60 * 1000);

    const movementsInCycle = sortedMovements.filter((m) => {
      const mDate = new Date(m.date);
      return mDate >= cycleStart && mDate < nextCycleMonth;
    });

    let deliveredInCycle = 0;
    let periodOutwardDate: Date | null = null;
    let endOfCycleRemaining = currentOpening;

    for (const m of movementsInCycle) {
      if (m.type === 'PARTIAL_OUTWARD' || m.type === 'FINAL_OUTWARD') {
        deliveredInCycle += m.deliveredBags;
        endOfCycleRemaining = Math.max(0, endOfCycleRemaining - m.deliveredBags);
        periodOutwardDate = new Date(m.date);
      } else if (m.type === 'DELIVERY_REVERSAL') {
        deliveredInCycle = Math.max(0, deliveredInCycle - m.deliveredBags);
        endOfCycleRemaining = endOfCycleRemaining + m.deliveredBags;
      }
    }

    const fmt = (d: Date) =>
      d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const billingPeriod = `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
    const applicableMonth = cycleStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const occupancyBags = currentOpening;
    const calculatedCharge = Number((occupancyBags * bagRate).toFixed(2));

    periods.push({
      grnId,
      grnNumber,
      inwardDate: inDate,
      outwardDate: periodOutwardDate,
      billingPeriod,
      applicableMonth,
      periodIndex,
      openingBags: currentOpening,
      deliveredBags: deliveredInCycle,
      remainingBags: endOfCycleRemaining,
      occupancyBags,
      bagRate,
      calculatedCharge,
    });

    currentOpening = endOfCycleRemaining;
    if (currentOpening <= 0) {
      break;
    }

    cycleStart = nextCycleMonth;
    periodIndex++;
  }

  return periods;
}

