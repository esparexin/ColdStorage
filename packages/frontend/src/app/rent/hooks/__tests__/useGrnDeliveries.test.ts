import { describe, expect, it } from 'vitest';
import { categorizeOutwardBags } from '../useGrnDeliveries';

describe('useGrnDeliveries helper', () => {
  describe('categorizeOutwardBags', () => {
    it('returns "Small" when only small bags are present', () => {
      expect(categorizeOutwardBags(50, 0)).toBe('Small');
      expect(categorizeOutwardBags(1, 0)).toBe('Small');
    });

    it('returns "Big" when only big bags are present', () => {
      expect(categorizeOutwardBags(0, 40)).toBe('Big');
      expect(categorizeOutwardBags(0, 1)).toBe('Big');
    });

    it('returns "Small & Big" when both small and big bags are present', () => {
      expect(categorizeOutwardBags(30, 20)).toBe('Small & Big');
      expect(categorizeOutwardBags(1, 1)).toBe('Small & Big');
    });

    it('defaults to "Small & Big" when neither is greater than zero', () => {
      expect(categorizeOutwardBags(0, 0)).toBe('Small & Big');
    });
  });
});
