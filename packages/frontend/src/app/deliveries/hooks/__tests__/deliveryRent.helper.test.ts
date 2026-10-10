import { describe, expect, it } from 'vitest';
import { resolveOutwardRates } from '@cold-storage/contracts';
import {
  computeOutwardRentCharge,
  formatOutwardRentFormula,
  getOutwardEffectiveRates,
} from '../deliveryRent.helper';

describe('deliveryRent.helper', () => {
  describe('computeOutwardRentCharge', () => {
    it('charges Seasonal withdrawals at the whole-season total rate', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small',
        smallBags: 50,
        bigBags: 0,
      });
      // 50 bags * 10 season total = 500
      expect(rent).toBe(500);
    });

    it('charges Seasonal big-bag withdrawals at the whole-season total rate', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Big',
        smallBags: 0,
        bigBags: 40,
      });
      // 40 bags * 15 season total = 600
      expect(rent).toBe(600);
    });

    it('charges Seasonal split withdrawals preserving the S+B split', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 20,
        bigBags: 30,
      });
      // 20 * 10 + 30 * 15 = 200 + 450 = 650 season total
      expect(rent).toBe(650);
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
      // 20 * 12 + 30 * 18 = 240 + 540 = 780 season total
      expect(rent).toBe(780);
    });

    it('screenshot regression: 200 Small + 200 Big Seasonal canonical = ₹5,000 season total', () => {
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 200,
        bigBags: 200,
      });
      // 200 * 10 + 200 * 15 = 5000 season total
      expect(rent).toBe(5000);
      const rates = getOutwardEffectiveRates('Seasonal', {});
      expect(rates).toEqual({ small: 10, big: 15 });
      expect(formatOutwardRentFormula('Seasonal', 'Small & Big', 200, 200, rates.small, rates.big)).toBe(
        '(200 Small × ₹10 + 200 Big × ₹15) × season total',
      );
    });

    it('screenshot divergence: uniform ₹12 agreed rate yields ₹4,800 with matching formula', () => {
      const overrides = { smallBagPrice: 12, bigBagPrice: 12 };
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 200,
        bigBags: 200,
        ...overrides,
      });
      // 200 * 12 + 200 * 12 = 4800 season total
      expect(rent).toBe(4800);
      const rates = getOutwardEffectiveRates('Seasonal', overrides);
      expect(rates).toEqual({ small: 12, big: 12 });
      expect(formatOutwardRentFormula('Seasonal', 'Small & Big', 200, 200, rates.small, rates.big)).toBe(
        '(200 Small × ₹12 + 200 Big × ₹12) × season total',
      );
    });

    it('resolves single bagPrice override to both rates', () => {
      expect(getOutwardEffectiveRates('Seasonal', { bagPrice: 12 })).toEqual({ small: 12, big: 12 });
      expect(resolveOutwardRates('Seasonal', { bagPrice: 12 })).toEqual({ small: 12, big: 12 });
      const rent = computeOutwardRentCharge({
        rentType: 'Seasonal',
        bagCategory: 'Small & Big',
        smallBags: 200,
        bigBags: 200,
        bagPrice: 12,
      });
      expect(rent).toBe(4800);
    });
  });

  describe('formatOutwardRentFormula', () => {
    it('formats Seasonal formula correctly for Small bags', () => {
      const text = formatOutwardRentFormula('Seasonal', 'Small', 50, 0, 10, 15);
      expect(text).toBe('50 bags × ₹10/bag × season total');
    });

    it('formats Seasonal formula correctly for Big bags', () => {
      const text = formatOutwardRentFormula('Seasonal', 'Big', 0, 40, 10, 15);
      expect(text).toBe('40 bags × ₹15/bag × season total');
    });

    it('formats Monthly formula correctly for Small & Big bags', () => {
      const text = formatOutwardRentFormula('Monthly', 'Small & Big', 10, 20, 10, 15, 2);
      expect(text).toBe('(10 Small × ₹10 + 20 Big × ₹15) × 2 mo');
    });
  });
});
