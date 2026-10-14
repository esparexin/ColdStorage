import { describe, expect, it } from 'vitest';
import {
  calculateRentAmount,
  canCalculateAuthoritativeRent,
} from '../index.js';

describe('Phase 1 S/B Pricing Lifecycle & Contract Regression Tests (Option A)', () => {
  describe('1. Equal Rates (Unsegregated & Explicit Splits)', () => {
    it('calculates authoritative rent for unsegregated lots when rates are equal', () => {
      // Seasonal: 100 bags × ₹10 = ₹1,000 (authoritative, no split required)
      const seasonalRent = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 10,
      });
      expect(seasonalRent).toBe(1000);

      // Monthly: 100 bags × ₹10 × 2 months = ₹2,000
      const monthlyRent = calculateRentAmount({
        rentType: 'Monthly',
        bags: 100,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 10,
        rentMonths: 2,
      });
      expect(monthlyRent).toBe(2000);
    });

    it('calculates identical authoritative rent for explicit splits when rates are equal', () => {
      const splits = [
        { small: 100, big: 0 },
        { small: 0, big: 100 },
        { small: 50, big: 50 },
        { small: 75, big: 25 },
        { small: 10, big: 90 },
      ];

      for (const split of splits) {
        const amount = calculateRentAmount({
          rentType: 'Seasonal',
          bags: 100,
          bagType: 'S+B',
          smallBags: split.small,
          bigBags: split.big,
          smallBagPrice: 10,
          bigBagPrice: 10,
        });
        expect(amount).toBe(1000);
      }
    });

    it('confirms authoritative status via canCalculateAuthoritativeRent for equal rates without split', () => {
      const check = canCalculateAuthoritativeRent({
        bagType: 'S/B',
        bags: 100,
        smallBagPrice: 12,
        bigBagPrice: 12,
      });
      expect(check.canCalculate).toBe(true);
    });
  });

  describe('2. Differential Rates & Unsegregated Composition (Option A Enforced)', () => {
    it('returns 0 / unauthoritative rent for unsegregated S/B lots with differential rates', () => {
      const unsegregatedSeasonal = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      // Option A: Unverified composition must not produce an authoritative rent amount (no silent fallback to small)
      expect(unsegregatedSeasonal).toBe(0);

      const unsegregatedMonthly = calculateRentAmount({
        rentType: 'Monthly',
        bags: 100,
        bagType: 'S+B',
        smallBagPrice: 8,
        bigBagPrice: 14,
        rentMonths: 3,
      });
      expect(unsegregatedMonthly).toBe(0);
    });

    it('marks pending verification via canCalculateAuthoritativeRent when rates differ and split is unconfirmed', () => {
      const check = canCalculateAuthoritativeRent({
        bagType: 'S/B',
        bags: 100,
        smallBags: null,
        bigBags: null,
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(check.canCalculate).toBe(false);
      expect(check.reason).toBe('Small and big bag composition unverified; differential rates require confirmed counts');
    });

    it('calculates single-type S authoritatively using smallBagPrice even when rates differ', () => {
      const singleS = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(singleS).toBe(1000);

      const checkS = canCalculateAuthoritativeRent({
        bagType: 'S',
        bags: 100,
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(checkS.canCalculate).toBe(true);
    });

    it('calculates single-type B authoritatively using bigBagPrice even when rates differ', () => {
      const singleB = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'B',
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(singleB).toBe(1500);

      const checkB = canCalculateAuthoritativeRent({
        bagType: 'B',
        bags: 100,
        smallBagPrice: 10,
        bigBagPrice: 15,
      });
      expect(checkB.canCalculate).toBe(true);
    });

    it('calculates Hybrid category lots authoritatively using flat bagPrice', () => {
      const hybrid = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagCategory: 'Hybrid',
        bagPrice: 12,
      });
      expect(hybrid).toBe(1200);

      const hybridMonthly = calculateRentAmount({
        rentType: 'Monthly',
        bags: 100,
        bagCategory: 'Modern Size',
        bagPrice: 12,
        rentMonths: 3,
      });
      expect(hybridMonthly).toBe(3600);
    });
  });

  describe('3. Explicit Compositions with Differential Rates', () => {
    const sRate = 10;
    const bRate = 15;

    it('calculates exact weighted total for 100/0 composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S+B',
        smallBags: 100,
        bigBags: 0,
        smallBagPrice: sRate,
        bigBagPrice: bRate,
      });
      // 100 × 10 + 0 × 15 = 1,000
      expect(amount).toBe(1000);
    });

    it('calculates exact weighted total for 0/100 composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S+B',
        smallBags: 0,
        bigBags: 100,
        smallBagPrice: sRate,
        bigBagPrice: bRate,
      });
      // 0 × 10 + 100 × 15 = 1,500
      expect(amount).toBe(1500);
    });

    it('calculates exact weighted total for 10/90 composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S+B',
        smallBags: 10,
        bigBags: 90,
        smallBagPrice: sRate,
        bigBagPrice: bRate,
      });
      // 10 × 10 + 90 × 15 = 100 + 1350 = 1,450
      expect(amount).toBe(1450);
    });

    it('calculates exact weighted total for 15/85 composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S+B',
        smallBags: 15,
        bigBags: 85,
        smallBagPrice: sRate,
        bigBagPrice: bRate,
      });
      // 15 × 10 + 85 × 15 = 150 + 1275 = 1,425
      expect(amount).toBe(1425);
    });

    it('calculates exact weighted total for 75/25 composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Seasonal',
        bags: 100,
        bagType: 'S+B',
        smallBags: 75,
        bigBags: 25,
        smallBagPrice: sRate,
        bigBagPrice: bRate,
      });
      // 75 × 10 + 25 × 15 = 750 + 375 = 1,125
      expect(amount).toBe(1125);
    });

    it('calculates Monthly full-cycle billing for explicit composition', () => {
      const amount = calculateRentAmount({
        rentType: 'Monthly',
        bags: 100,
        bagType: 'S+B',
        smallBags: 60,
        bigBags: 40,
        smallBagPrice: 8,
        bigBagPrice: 12,
        rentMonths: 3,
      });
      // (60 × 8 + 40 × 12) × 3 = (480 + 480) × 3 = 960 × 3 = 2,880
      expect(amount).toBe(2880);
    });
  });
});
