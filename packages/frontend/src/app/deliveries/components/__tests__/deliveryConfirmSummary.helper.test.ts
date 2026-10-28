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

    it('multiplies totalBags by hamaliRate correctly', () => {
      expect(calculateProRataHamali(100, 3.5)).toBe(350);
      expect(calculateProRataHamali(50, 4)).toBe(200);
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
