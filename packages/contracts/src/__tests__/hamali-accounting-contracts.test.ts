import { describe, expect, it } from 'vitest';
import {
  calculateNetRentAmount,
  calculateOutwardSeasonalBreakdown,
  deriveNetStorageRate,
  splitInclusiveRate,
} from '../index.js';

describe('Option A Path 2 - Shared Contracts Hamali Accounting SSOT', () => {
  describe('deriveNetStorageRate', () => {
    it('derives net storage rates for standard Small and Big bags', () => {
      // Small: ₹110 inclusive - ₹25 hamali = ₹85 net storage
      expect(deriveNetStorageRate(110, 25)).toBe(85);
      // Big: ₹185 inclusive - ₹25 hamali = ₹160 net storage
      expect(deriveNetStorageRate(185, 25)).toBe(160);
    });

    it('derives net storage rates for Hybrid bags', () => {
      // Hybrid: ₹210 inclusive - ₹25 hamali = ₹185 net storage
      expect(deriveNetStorageRate(210, 25)).toBe(185);
    });

    it('handles zero or missing hamali rate safely without deduction', () => {
      expect(deriveNetStorageRate(110, 0)).toBe(110);
      expect(deriveNetStorageRate(110, null)).toBe(110);
      expect(deriveNetStorageRate(110, undefined)).toBe(110);
      expect(deriveNetStorageRate(110, -10)).toBe(110);
    });

    it('clamps negative results to zero if inclusive rate is less than hamali', () => {
      expect(deriveNetStorageRate(20, 25)).toBe(0);
      expect(deriveNetStorageRate(0, 25)).toBe(0);
    });
  });

  describe('splitInclusiveRate', () => {
    it('splits gross rates into net storage and hamali components cleanly', () => {
      expect(splitInclusiveRate(110, 25)).toEqual({ netStorageRate: 85, hamaliComponent: 25 });
      expect(splitInclusiveRate(185, 25)).toEqual({ netStorageRate: 160, hamaliComponent: 25 });
      expect(splitInclusiveRate(210, 25)).toEqual({ netStorageRate: 185, hamaliComponent: 25 });
    });

    it('handles commodities without hamali', () => {
      expect(splitInclusiveRate(110, 0)).toEqual({ netStorageRate: 110, hamaliComponent: 0 });
      expect(splitInclusiveRate(110, null)).toEqual({ netStorageRate: 110, hamaliComponent: 0 });
    });
  });

  describe('calculateNetRentAmount', () => {
    it('calculates initial commitment for 10 Small + 8 Big Mirchi consignment (18 bags)', () => {
      const result = calculateNetRentAmount(
        {
          rentType: 'Seasonal',
          bags: 18,
          bagType: 'S/B',
          smallBags: 10,
          bigBags: 8,
          smallBagPrice: 110,
          bigBagPrice: 185,
        },
        25,
      );

      // Gross subscription: 10 * 110 + 8 * 185 = 2,580
      expect(result.grossRent).toBe(2580);
      // Inward handling labor component: 18 bags * ₹25 = 450
      expect(result.hamaliAmount).toBe(450);
      // Net Storage Rent: 2,580 - 450 = 2,130 (10 * 85 + 8 * 160)
      expect(result.netStorageRent).toBe(2130);
      expect(result.netStorageRent + result.hamaliAmount).toBe(result.grossRent);
    });

    it('calculates initial commitment for 100 Hybrid bags', () => {
      const result = calculateNetRentAmount(
        {
          rentType: 'Seasonal',
          bags: 100,
          bagType: 'Hybrid',
          bagPrice: 210,
        },
        25,
      );

      // Gross subscription: 100 * 210 = 21,000
      expect(result.grossRent).toBe(21000);
      // Inward handling labor: 100 * 25 = 2,500
      expect(result.hamaliAmount).toBe(2500);
      // Net Storage Rent: 21,000 - 2,500 = 18,500 (100 * 185)
      expect(result.netStorageRent).toBe(18500);
    });

    it('does not deduct hamali from pure Monthly rent', () => {
      const result = calculateNetRentAmount(
        {
          rentType: 'Monthly',
          bags: 10,
          bagPrice: 30,
          rentMonths: 2,
        },
        25,
      );

      // Monthly is pure storage rent: 10 * 30 * 2 = 600, hamali = 0
      expect(result.grossRent).toBe(600);
      expect(result.netStorageRent).toBe(600);
      expect(result.hamaliAmount).toBe(0);
    });
  });

  describe('calculateOutwardSeasonalBreakdown - Option A Path 2 Verification', () => {
    it('accurately resolves the user screenshot scenario (GRN 0023: 1 Small + 1 Big from 2024 to 2026)', () => {
      // User Consignment:
      // Inward Date: 2024-03-20
      // Outward Delivery Date: 2026-10-31
      // Withdrawing: 1 Small Bag, 1 Big Bag (Total 2 bags)
      // Commodity Rates: Small ₹110 (Gross), Big ₹185 (Gross), Hamali ₹25
      // Monthly Rates: Small ₹30, Big ₹40
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: '2024-03-20',
        deliveryDate: '2026-10-31',
        smallBags: 1,
        bigBags: 1,
        seasonalRates: { small: 110, big: 185 },
        monthlyRates: { small: 30, big: 40 },
        hamaliRate: 25,
      });

      // 7 billing periods:
      // 1. (2024) Mar-Dec: 1 Small @ 85 + 1 Big @ 160 = 245
      // 2. Jan 2025:       1 Small @ 30 + 1 Big @ 40  = 70
      // 3. Feb 2025:       1 Small @ 30 + 1 Big @ 40  = 70
      // 4. (2025) Mar-Dec: 1 Small @ 85 + 1 Big @ 160 = 245 (Subsequent Season Net Storage!)
      // 5. Jan 2026:       1 Small @ 30 + 1 Big @ 40  = 70
      // 6. Feb 2026:       1 Small @ 30 + 1 Big @ 40  = 70
      // 7. (2026) Mar-Dec: 1 Small @ 85 + 1 Big @ 160 = 245 (Subsequent Season Net Storage!)
      expect(breakdown.periods).toHaveLength(7);

      expect(breakdown.periods[0].periodKey).toBe('SEASON_2024');
      expect(breakdown.periods[0].smallRate).toBe(85);
      expect(breakdown.periods[0].bigRate).toBe(160);
      expect(breakdown.periods[0].amount).toBe(245);

      expect(breakdown.periods[1].periodKey).toBe('JANUARY_2025');
      expect(breakdown.periods[1].amount).toBe(70);

      expect(breakdown.periods[2].periodKey).toBe('FEBRUARY_2025');
      expect(breakdown.periods[2].amount).toBe(70);

      expect(breakdown.periods[3].periodKey).toBe('SEASON_2025');
      expect(breakdown.periods[3].smallRate).toBe(85);
      expect(breakdown.periods[3].bigRate).toBe(160);
      expect(breakdown.periods[3].amount).toBe(245);

      expect(breakdown.periods[4].periodKey).toBe('JANUARY_2026');
      expect(breakdown.periods[4].amount).toBe(70);

      expect(breakdown.periods[5].periodKey).toBe('FEBRUARY_2026');
      expect(breakdown.periods[5].amount).toBe(70);

      expect(breakdown.periods[6].periodKey).toBe('SEASON_2026');
      expect(breakdown.periods[6].smallRate).toBe(85);
      expect(breakdown.periods[6].bigRate).toBe(160);
      expect(breakdown.periods[6].amount).toBe(245);

      // Storage Rent = 245 + 70 + 70 + 245 + 70 + 70 + 245 = 1,015.00
      expect(breakdown.storageRent).toBe(1015);
      expect(breakdown.totalRent).toBe(1015);

      // One-time Inward Hamali Component = 2 bags * ₹25 = 50.00
      expect(breakdown.hamaliAmount).toBe(50);

      // Total Payable = Storage Rent (1,015) + Hamali (50) = 1,065.00
      expect(breakdown.totalAmount).toBe(1065);
    });

    it('preserves backward compatibility when hamaliRate is omitted', () => {
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: '2024-03-20',
        deliveryDate: '2024-10-31',
        smallBags: 10,
        bigBags: 8,
        seasonalRates: { small: 110, big: 185 },
        monthlyRates: { small: 30, big: 40 },
      });

      // No hamaliRate passed -> uses gross rates directly (10*110 + 8*185 = 2,580)
      expect(breakdown.storageRent).toBe(2580);
      expect(breakdown.totalRent).toBe(2580);
      expect(breakdown.hamaliAmount).toBe(0);
      expect(breakdown.totalAmount).toBe(2580);
    });
  });
});

