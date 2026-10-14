import { z } from 'zod';
import { type BagType, isHybridBagCategory, canCalculateAuthoritativeRent } from './bags.js';
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
export interface CanonicalBagRate { small: number; big: number; }

/** Canonical reference rates for Small and Big bags under Seasonal and Monthly rent types. */
export const CANONICAL_BAG_RATES: Record<RentType, CanonicalBagRate> = {
  Seasonal: { small: 10, big: 15 }, Seasonal_3M: { small: 10, big: 15 }, Monthly: { small: 10, big: 15 },
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
  bagCategory?: string | null;
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
  const isSeasonal = input.rentType === 'Seasonal' || input.rentType === 'Seasonal_3M';
  const months = isSeasonal ? 1 : Math.max(1, input.rentMonths ?? 1);

  if (isHybridBagCategory(input.bagCategory) && typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    return Number((input.bags * input.bagPrice * months).toFixed(2));
  }

  const sRate = input.smallBagPrice ?? input.bagPrice ?? 0;
  const bRate = input.bigBagPrice ?? input.bagPrice ?? 0;
  const hasDiffRates = (input.smallBagPrice != null || input.bigBagPrice != null) && sRate !== bRate;

  if (input.bagType === 'S') {
    const rate = sRate > 0 ? sRate : bRate;
    if (rate > 0) return Number((input.bags * rate * months).toFixed(2));
  }
  if (input.bagType === 'B') {
    const rate = bRate > 0 ? bRate : sRate;
    if (rate > 0) return Number((input.bags * rate * months).toFixed(2));
  }

  const isSb = input.bagType === 'S+B' || input.bagType === 'S/B' || input.bagType == null || input.smallBags != null || input.bigBags != null;

  if (hasDiffRates) {
    const canCalc = canCalculateAuthoritativeRent({
      bagType: input.bagType, bags: input.bags,
      smallBags: input.smallBags, bigBags: input.bigBags,
      bagPrice: input.bagPrice, smallBagPrice: input.smallBagPrice, bigBagPrice: input.bigBagPrice,
    });
    if (!canCalc.canCalculate) {
      // Differential rates require confirmed composition; unverified composition cannot produce an authoritative amount
      return Number((input.rentAmount ?? 0).toFixed(2));
    }
    const sCount = input.smallBags ?? 0;
    const bCount = input.bigBags ?? 0;
    return Number(((sCount * sRate + bCount * bRate) * months).toFixed(2));
  }

  // Equal rates or flat per-bag rate across S/B
  if (isSb) {
    const hasSplit = (input.smallBags != null || input.bigBags != null) &&
      (input.smallBags ?? 0) + (input.bigBags ?? 0) === input.bags;
    if (hasSplit) {
      const sCount = input.smallBags ?? 0;
      const bCount = input.bigBags ?? 0;
      if (sRate > 0 || bRate > 0) {
        return Number(((sCount * sRate + bCount * bRate) * months).toFixed(2));
      }
    }
    const rate = sRate > 0 ? sRate : bRate;
    if (rate > 0) return Number((input.bags * rate * months).toFixed(2));
  }

  if (typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    return Number((input.bags * input.bagPrice * months).toFixed(2));
  }
  return Number((input.rentAmount ?? 0).toFixed(2));
}

/** Seasonal renewal under the same GRN: Applicable Bags × Seasonal Rate. */
export function calculateSeasonalRenewal(input: RentalCalculationInput): number {
  return calculateRentAmount({ ...input, rentType: 'Seasonal' });
}

/** Derives the effective per-bag rate from an obligation. */
export function deriveBagPrice(input: {
  rentType: RentType;
  bags: number;
  bagPrice?: number | null;
  rentMonths?: number | null;
  rentAmount?: number | null;
}): number | null {
  if (typeof input.bagPrice === 'number' && input.bagPrice > 0) return input.bagPrice;
  if (typeof input.rentAmount === 'number' && input.bags > 0) {
    if (input.rentType === 'Seasonal' || input.rentType === 'Seasonal_3M') return Number((input.rentAmount / input.bags).toFixed(2));
    const months = Math.max(1, input.rentMonths ?? 1);
    return Number((input.rentAmount / (input.bags * months)).toFixed(2));
  }
  return null;
}

/** Billing cycle label: Seasonal is fixed; Monthly is the day-of-month cycle. */
export function deriveBillingCycle(inwardDate: Date, rentType: RentType, asOfDate: Date = new Date()): string {
  if (rentType === 'Seasonal') return 'Season total (Mar–Dec)';
  if (rentType === 'Seasonal_3M') return 'Season total (3 Months)';
  const inDate = new Date(inwardDate);
  const now = new Date(asOfDate);
  const day = inDate.getDate();

  let cycleStartYear = now.getFullYear();
  let cycleStartMonth = now.getMonth();
  if (now.getDate() < day) cycleStartMonth -= 1;

  const cycleStart = new Date(cycleStartYear, cycleStartMonth, day);
  const nextMonth = new Date(cycleStartYear, cycleStartMonth + 1, day);
  const cycleEnd = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
}

/** Authoritative elapsed monthly billing cycle calculation (1-day storage = full month minimum). */
export function calculateMonthlyElapsedCycles(inwardDate: Date | string, outwardDate: Date | string = new Date()): number {
  const inD = new Date(inwardDate);
  const outD = new Date(outwardDate);
  const inTime = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate()).getTime();
  const outTime = new Date(outD.getFullYear(), outD.getMonth(), outD.getDate()).getTime();
  if (outTime <= inTime) return 1;

  const anchorDay = inD.getDate();
  let cycles = 1;
  while (true) {
    const targetMonthIndex = inD.getMonth() + cycles;
    const targetYear = inD.getFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const maxDays = new Date(targetYear, targetMonth + 1, 0).getDate();
    const cycleDay = Math.min(anchorDay, maxDays);
    const nextCycleStart = new Date(targetYear, targetMonth, cycleDay).getTime();
    if (outTime >= nextCycleStart) cycles++;
    else break;
  }
  return Math.max(1, cycles);
}

/** Additional billable months for 3-month seasonal storage (N - 3, min 0). */
export function calculate3MAdditionalMonths(inwardDate: Date | string, deliveryDate: Date | string = new Date()): number {
  return Math.max(0, calculateMonthlyElapsedCycles(inwardDate, deliveryDate) - 3);
}

export interface MovementSnapshot { date: Date; type: string; deliveredBags: number; closingBags: number; }

export interface OccupancyCalculationInput {
  grnId: string;
  grnNumber: string;
  inwardDate: Date;
  totalBags: number;
  bagRate: number;
  movements: MovementSnapshot[];
  asOfDate?: Date;
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

    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const billingPeriod = `${fmt(cycleStart)} – ${fmt(cycleEnd)}`;
    const applicableMonth = cycleStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const occupancyBags = currentOpening;
    const calculatedCharge = Number((occupancyBags * bagRate).toFixed(2));

    periods.push({
      grnId, grnNumber, inwardDate: inDate, outwardDate: periodOutwardDate,
      billingPeriod, applicableMonth, periodIndex,
      openingBags: currentOpening, deliveredBags: deliveredInCycle, remainingBags: endOfCycleRemaining,
      occupancyBags, bagRate, calculatedCharge,
    });

    currentOpening = endOfCycleRemaining;
    if (currentOpening <= 0) break;
    cycleStart = nextCycleMonth;
    periodIndex++;
  }

  return periods;
}

