import { describe, expect, it } from 'vitest';
import {
  allocateHamaliShare,
  calculate3MAdditionalMonths,
  calculateHamaliAmount,
  calculateRentAmount,
  CANONICAL_BAG_RATES,
  commodityRateSchema,
  createCommoditySchema,
  createGrnSchema,
  deriveBagPrice,
  deriveBillingCycle,
  hamaliRateSchema,
  isFirstSeasonExtensions,
  rentMonthsForType,
  rentTypeSchema,
  updateCommoditySchema,
} from '../index.js';

describe('Seasonal 3-Month & Hamali Contracts SSOT', () => {
  describe('RentType and Season Duration Schemas', () => {
    it('validates Seasonal_3M as an approved rentType', () => {
      expect(rentTypeSchema.safeParse('Seasonal_3M').success).toBe(true);
      expect(rentTypeSchema.safeParse('Seasonal').success).toBe(true);
      expect(rentTypeSchema.safeParse('Monthly').success).toBe(true);
      expect(rentTypeSchema.safeParse('Annual').success).toBe(false);
    });

    it('returns 3 months for Seasonal_3M and 10 months for Seasonal', () => {
      expect(rentMonthsForType('Seasonal_3M')).toBe(3);
      expect(rentMonthsForType('Seasonal')).toBe(10);
      expect(rentMonthsForType('Monthly')).toBeNull();
    });

    it('defines canonical fallback rates for Seasonal_3M', () => {
      expect(CANONICAL_BAG_RATES.Seasonal_3M).toEqual({ small: 10, big: 15 });
    });
  });

  describe('3-Month Seasonal Rent Calculation', () => {
    it('calculates 3-Month Seasonal rent as a whole-term total (never multiplied by months)', () => {
      const charge = calculateRentAmount({
        rentType: 'Seasonal_3M',
        bags: 100,
        bagPrice: 30,
      });
      expect(charge).toBe(3000);
    });

    it('calculates 3-Month Seasonal rent with small and big bag rate split', () => {
      const charge = calculateRentAmount({
        rentType: 'Seasonal_3M',
        bags: 100,
        bagType: 'S+B',
        smallBags: 60,
        bigBags: 40,
        smallBagPrice: 25,
        bigBagPrice: 35,
      });
      // 60 * 25 + 40 * 35 = 1500 + 1400 = 2900
      expect(charge).toBe(2900);
    });

    it('derives bag price for Seasonal_3M identically to whole-season division', () => {
      const price = deriveBagPrice({
        rentType: 'Seasonal_3M',
        bags: 100,
        rentAmount: 3500,
      });
      expect(price).toBe(35);
    });

    it('derives billing cycle label for Seasonal_3M', () => {
      const label = deriveBillingCycle(new Date('2026-01-15'), 'Seasonal_3M');
      expect(label).toBe('Season total (3 Months)');
    });

    it('calculates additional months beyond initial 3-month term', () => {
      const inward = '2026-01-15';
      // Within 3 months -> 0 additional months
      expect(calculate3MAdditionalMonths(inward, '2026-01-20')).toBe(0);
      expect(calculate3MAdditionalMonths(inward, '2026-02-14')).toBe(0);
      expect(calculate3MAdditionalMonths(inward, '2026-03-14')).toBe(0);
      expect(calculate3MAdditionalMonths(inward, '2026-04-14')).toBe(0);

      // Cycle 4 (Month 4 begins on April 15) -> 1 additional month
      expect(calculate3MAdditionalMonths(inward, '2026-04-15')).toBe(1);
      expect(calculate3MAdditionalMonths(inward, '2026-05-14')).toBe(1);

      // Cycle 5 (Month 5 begins on May 15) -> 2 additional months
      expect(calculate3MAdditionalMonths(inward, '2026-05-15')).toBe(2);
      expect(calculate3MAdditionalMonths(inward, '2026-06-14')).toBe(2);

      // Cycle 6 (Month 6 begins on June 15) -> 3 additional months
      expect(calculate3MAdditionalMonths(inward, '2026-06-15')).toBe(3);
    });

    it('calculates additional months correctly across month-end clamped dates (Jan 31)', () => {
      const inward = '2026-01-31';
      // Cycle 1: Jan 31 - Feb 27
      // Cycle 2: Feb 28 - Mar 30
      // Cycle 3: Mar 31 - Apr 29 -> End of initial 3 months
      expect(calculate3MAdditionalMonths(inward, '2026-04-29')).toBe(0);

      // Cycle 4 starts April 30 -> 1 additional month
      expect(calculate3MAdditionalMonths(inward, '2026-04-30')).toBe(1);
    });
  });

  describe('Hamali Calculation & Schema', () => {
    it('validates non-negative hamali rates', () => {
      expect(hamaliRateSchema.safeParse(5).success).toBe(true);
      expect(hamaliRateSchema.safeParse(0).success).toBe(true);
      expect(hamaliRateSchema.safeParse(-1).success).toBe(false);
      expect(hamaliRateSchema.safeParse('invalid').success).toBe(false);
    });

    it('calculates hamali amount as total bags multiplied by rate per bag', () => {
      expect(calculateHamaliAmount(200, 5)).toBe(1000);
      expect(calculateHamaliAmount(100, 3.5)).toBe(350);
      expect(calculateHamaliAmount(50, 0)).toBe(0);
      expect(calculateHamaliAmount(0, 5)).toBe(0);
      expect(calculateHamaliAmount(100, null)).toBe(0);
      expect(calculateHamaliAmount(100, undefined)).toBe(0);
    });

    it('is bag-category agnostic (computes solely by total bags)', () => {
      // 100 bags regardless of category
      const amountSmall = calculateHamaliAmount(100, 5);
      const amountBig = calculateHamaliAmount(100, 5);
      const amountMixed = calculateHamaliAmount(60 + 40, 5);
      expect(amountSmall).toBe(500);
      expect(amountBig).toBe(500);
      expect(amountMixed).toBe(500);
    });

    it('keeps first-season eligibility until a SEASON renewal exists (R2)', () => {
      expect(isFirstSeasonExtensions([])).toBe(true);
      expect(isFirstSeasonExtensions([{ period: 'JANUARY' }, { period: 'FEBRUARY' }])).toBe(true);
      expect(isFirstSeasonExtensions([{ period: 'SEASON' }])).toBe(false);
      expect(
        isFirstSeasonExtensions([{ period: 'JANUARY' }, { period: 'FEBRUARY' }, { period: 'SEASON' }]),
      ).toBe(false);
    });

    it('allocates partial outward shares capped at the original amount (R1)', () => {
      expect(allocateHamaliShare(400, 30, 100, 0)).toBe(120);
      expect(allocateHamaliShare(400, 70, 100, 120)).toBe(280);
      // Cap: prior allocation bounds the remainder (rounding-safe)
      expect(allocateHamaliShare(400, 70, 100, 121)).toBe(279);
      expect(allocateHamaliShare(400, 100, 100, 400)).toBe(0);
      expect(allocateHamaliShare(0, 30, 100, 0)).toBe(0);
      expect(allocateHamaliShare(400, 0, 100, 0)).toBe(0);
      expect(allocateHamaliShare(400, 30, 0, 0)).toBe(0);
    });
  });

  describe('Commodity & Commodity Rate Schemas', () => {
    it('validates commodity with seasonDuration and hamaliRate', () => {
      const valid10M = createCommoditySchema.parse({
        name: 'Potato 10M',
        seasonDuration: 'Seasonal',
        hamaliRate: 5,
      });
      expect(valid10M.seasonDuration).toBe('Seasonal');
      expect(valid10M.hamaliRate).toBe(5);

      const valid3M = createCommoditySchema.parse({
        name: 'Potato 3M',
        seasonDuration: 'Seasonal_3M',
        hamaliRate: 4.5,
      });
      expect(valid3M.seasonDuration).toBe('Seasonal_3M');
      expect(valid3M.hamaliRate).toBe(4.5);
    });

    it('defaults seasonDuration to Seasonal and hamaliRate to 0 when omitted', () => {
      const def = createCommoditySchema.parse({ name: 'Onion' });
      expect(def.seasonDuration).toBe('Seasonal');
      expect(def.hamaliRate).toBe(0);
    });

    it('accepts partial updates to seasonDuration and hamaliRate in updateCommoditySchema', () => {
      const update = updateCommoditySchema.parse({
        seasonDuration: 'Seasonal_3M',
        hamaliRate: 6,
      });
      expect(update.seasonDuration).toBe('Seasonal_3M');
      expect(update.hamaliRate).toBe(6);
    });

    it('validates commodityRateSchema with hamaliRate', () => {
      const rateDoc = commodityRateSchema.parse({
        id: 'crt-1',
        commodityId: 'cmd-1',
        rentType: 'Seasonal',
        smallRate: 30,
        bigRate: 35,
        hamaliRate: 5,
      });
      expect(rateDoc.rentType).toBe('Seasonal');
      expect(rateDoc.hamaliRate).toBe(5);
    });
  });

  describe('GRN Inward Schema with Seasonal_3M (no stored Hamali)', () => {
    it('requires rentMonths to be omitted for Seasonal_3M inward', () => {
      const validPayload = {
        grnNumber: '0142',
        date: new Date('2026-01-15'),
        customerId: 'cust-1',
        commodityId: 'cmd-1',
        chamber: 'CH-01',
        bags: 200,
        bagType: 'S/B' as const,
        rentType: 'Seasonal_3M' as const,
        bagPrice: 30,
      };

      const parsed = createGrnSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      const invalidWithMonths = createGrnSchema.safeParse({
        ...validPayload,
        rentMonths: 3,
      });
      expect(invalidWithMonths.success).toBe(false);
      expect(invalidWithMonths.error?.issues[0]?.message).toBe(
        "rentMonths must be omitted for 'Seasonal' rent",
      );
    });
  });
});
