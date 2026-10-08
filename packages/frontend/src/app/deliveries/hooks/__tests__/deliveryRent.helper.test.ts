import { describe, expect, it } from 'vitest';
import {
  computeOutwardRentCharge,
  formatOutwardRentFormula,
} from '../deliveryRent.helper';

describe('deliveryRent.helper', () => {
  describe('computeOutwardRentCharge', () => {
    it('calculates Seasonal rent for Small bags (10 months)', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small',
        smallBags: 50,
        bigBags: 0,
      });
      // 50 bags * 10 rate * 10 months = 5000
      expect(rent).toBe(5000);
    });

    it('calculates Seasonal rent for Big bags (10 months)', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Big',
        smallBags: 0,
        bigBags: 40,
      });
      // 40 bags * 15 rate * 10 months = 6000
      expect(rent).toBe(6000);
    });

    it('calculates Seasonal rent for Small & Big bags (10 months)', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 20,
        bigBags: 30,
      });
      // (20 * 10 + 30 * 15) * 10 = (200 + 450) * 10 = 6500
      expect(rent).toBe(6500);
    });

    it('calculates Monthly rent with specified rentMonths', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Monthly',
        bagCategory: 'Small',
        smallBags: 25,
        bigBags: 0,
        rentMonths: 3,
      });
      // 25 bags * 10 rate * 3 months = 750
      expect(rent).toBe(750);
    });

    it('calculates Monthly rent defaulting to 1 month when rentMonths not provided', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Monthly',
        bagCategory: 'Big',
        smallBags: 0,
        bigBags: 10,
      });
      // 10 bags * 15 rate * 1 month = 150
      expect(rent).toBe(150);
    });

    it('returns 0 when total delivering bags is 0', () => {
      expect(
        computeOutwardRentCharge({
          rentType: 'Seasonal',
          bagCategory: 'Small',
          smallBags: 0,
          bigBags: 0,
        }),
      ).toBe(0);
    });

    it('uses agreed smallBagPrice and bigBagPrice overrides when supplied', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 20,
        bigBags: 30,
        smallBagPrice: 12,
        bigBagPrice: 18,
      });
      // (20 * 12 + 30 * 18) * 10 = (240 + 540) * 10 = 7800
      expect(rent).toBe(7800);
    });
  });

  describe('formatOutwardRentFormula', () => {
    it('formats Seasonal formula correctly for Small bags', () => {
      const text = formatOutwardRentFormula('Seasonal', 'Small', 50, 0, 10, 15);
      expect(text).toBe('50 bags × ₹10/bag × 10 mos season');
    });

    it('formats Seasonal formula correctly for Big bags', () => {
      const text = formatOutwardRentFormula('Seasonal', 'Big', 0, 40, 10, 15);
      expect(text).toBe('40 bags × ₹15/bag × 10 mos season');
    });

    it('formats Monthly formula correctly for Small & Big bags', () => {
      const text = formatOutwardRentFormula('Monthly', 'Small & Big', 10, 20, 10, 15, 2);
      expect(text).toBe('(10 Small × ₹10 + 20 Big × ₹15) × 2 mo');
    });
  });
});
