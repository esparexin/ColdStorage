import { describe, expect, it } from 'vitest';
import {
  calculateProRataHamali,
  formatBagCompositionText,
  formatCurrencyAmount,
  formatProRataHamaliText,
} from '../deliveryConfirmSummary.helper';

describe('deliveryConfirmSummary.helper', () => {
  describe('formatBagCompositionText', () => {
    it('formats hybrid bag type with total bags and label', () => {
      expect(formatBagCompositionText('Hybrid', 50, 0, 0)).toBe('50 Bags (Hybrid)');
    });

    it('formats S/B bag type with small and big bags breakdown', () => {
      expect(formatBagCompositionText('S/B', 100, 40, 60)).toBe('40 Small / 60 Big');
    });

    it('formats standard S bag type with small bags count', () => {
      expect(formatBagCompositionText('S', 25, 25, 0)).toBe('25 Small / 0 Big');
    });
  });

  describe('calculateProRataHamali', () => {
    it('returns 0 when hamaliRate is null, undefined, or zero', () => {
      expect(calculateProRataHamali(100, null)).toBe(0);
      expect(calculateProRataHamali(100, undefined)).toBe(0);
      expect(calculateProRataHamali(100, 0)).toBe(0);
    });

    it('returns 0 when totalBags is zero or negative', () => {
      expect(calculateProRataHamali(0, 5)).toBe(0);
      expect(calculateProRataHamali(-10, 5)).toBe(0);
    });

    it('multiplies totalBags by hamaliRate correctly without context', () => {
      expect(calculateProRataHamali(100, 3.5)).toBe(350);
      expect(calculateProRataHamali(50, 4)).toBe(200);
    });

    it('allocates pro-rata share on partial delivery', () => {
      // 100 bags inward at ₹5/bag => ₹500 total obligation.
      // First partial delivery: 40 bags => ₹200
      const share1 = calculateProRataHamali(40, 5, {
        originalBags: 100,
        priorDeliveredBags: 0,
        totalHamaliAmount: 500,
      });
      expect(share1).toBe(200);

      // Second partial delivery: 60 bags => ₹300 (remaining ₹300 cap)
      const share2 = calculateProRataHamali(60, 5, {
        originalBags: 100,
        priorDeliveredBags: 40,
        totalHamaliAmount: 500,
      });
      expect(share2).toBe(300);
    });

    it('respects inward total hamali cap on subsequent deliveries', () => {
      // Total capped obligation ₹450 on 100 bags (rate ₹5).
      // Delivery 1: 50 bags
      const share1 = calculateProRataHamali(50, 5, {
        originalBags: 100,
        priorDeliveredBags: 0,
        totalHamaliAmount: 450,
      });
      expect(share1).toBe(225);

      // Delivery 2: 50 bags (priorDelivered = 50, prior share = 225)
      const share2 = calculateProRataHamali(50, 5, {
        originalBags: 100,
        priorDeliveredBags: 50,
        totalHamaliAmount: 450,
      });
      expect(share2).toBe(225);
    });
  });

  describe('formatProRataHamaliText', () => {
    it('returns "Not Applicable" when no hamali charge applies', () => {
      expect(formatProRataHamaliText(100, 0)).toBe('Not Applicable');
      expect(formatProRataHamaliText(100, null)).toBe('Not Applicable');
    });

    it('returns formatted currency and per-bag rate when hamali applies', () => {
      const text = formatProRataHamaliText(100, 5);
      expect(text).toContain('500.00');
      expect(text).toContain('₹5/bag');
    });
  });

  describe('formatCurrencyAmount', () => {
    it('formats positive currency amounts with 2 decimal places and rupee symbol', () => {
      const text = formatCurrencyAmount(1250);
      expect(text).toContain('₹');
      expect(text).toContain('1,250.00');
    });

    it('formats 0 with 2 decimal places', () => {
      expect(formatCurrencyAmount(0)).toBe('₹0.00');
    });
  });
});
