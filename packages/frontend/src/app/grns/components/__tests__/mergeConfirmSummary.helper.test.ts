import { describe, expect, it } from 'vitest';
import {
  formatRepackComposition,
  formatRepackHamali,
  formatRepackVariance,
} from '../mergeConfirmSummary.helper';

describe('mergeConfirmSummary.helper', () => {
  describe('formatRepackVariance', () => {
    it('returns direct consolidation when repackMode is false', () => {
      const result = formatRepackVariance(false, 100, 100);
      expect(result.text).toBe('No Physical Repack (Direct Consolidation)');
      expect(result.isVariance).toBe(false);
      expect(result.isLoss).toBe(false);
    });

    it('returns exact match when actual repacked bags equals total source bags', () => {
      const result = formatRepackVariance(true, 100, 100);
      expect(result.text).toBe('0 Bags (Exact match)');
      expect(result.isVariance).toBe(false);
      expect(result.isLoss).toBe(false);
    });

    it('identifies gain/smaller packaging when actual repacked bags exceeds source bags', () => {
      const result = formatRepackVariance(true, 120, 100);
      expect(result.text).toBe('+20 Bags (Gain / Smaller Packaging)');
      expect(result.isVariance).toBe(true);
      expect(result.isLoss).toBe(false);
    });

    it('identifies shrinkage/loss when actual repacked bags is less than source bags', () => {
      const result = formatRepackVariance(true, 85, 100);
      expect(result.text).toBe('-15 Bags (Shrinkage / Loss)');
      expect(result.isVariance).toBe(true);
      expect(result.isLoss).toBe(true);
    });
  });

  describe('formatRepackComposition', () => {
    it('formats non-repack mode as consolidated pool', () => {
      expect(formatRepackComposition(false, 'S/B', '', '', 0, 150)).toBe('150 Bags (Consolidated Pool)');
    });

    it('formats repack mode for Hybrid bag type', () => {
      expect(formatRepackComposition(true, 'Hybrid', '', '', 200, 200)).toBe('200 Bags (Hybrid)');
    });

    it('formats repack mode for S/B bag type with small and big counts', () => {
      expect(formatRepackComposition(true, 'S/B', 50, 75, 125, 125)).toBe('50 Small / 75 Big (125 Total)');
    });

    it('handles empty string counts cleanly in S/B', () => {
      expect(formatRepackComposition(true, 'S/B', '', 50, 50, 50)).toBe('0 Small / 50 Big (50 Total)');
    });
  });

  describe('formatRepackHamali', () => {
    it('returns "Not Applicable" when repackHamaliCharge is zero or negative', () => {
      expect(formatRepackHamali(0, 100, 5)).toBe('Not Applicable');
      expect(formatRepackHamali(-50, 100, 5)).toBe('Not Applicable');
    });

    it('returns formatted currency and labor breakdown when hamali charge is positive', () => {
      const text = formatRepackHamali(500, 100, 5);
      expect(text).toContain('500.00');
      expect(text).toContain('100 bags @ ₹5/bag');
    });
  });
});
