import { describe, expect, it } from 'vitest';
import {
  allocateHybridSplit,
  isHybridBagCategory,
  mergeGrnInputSchema,
} from '../index.js';

/**
 * Internal Move bag-category confirmation contracts.
 * Reuses the outward vocabulary: no competing enum. 'Mixed' stays a
 * Hybrid-family value via isHybridBagCategory; nothing is reinterpreted.
 */
describe('Merge bag-category confirmation contracts', () => {
  const base = {
    targetGrnId: 'grn-t',
    sourceGrnIds: ['grn-s'],
    remarks: 'Stock consolidation test',
  };

  it('accepts absent confirmation (legacy behavior preserved)', () => {
    const parsed = mergeGrnInputSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it.each(['Small', 'Big', 'Small & Big', 'Hybrid', 'Mixed', 'S/B'] as const)(
    'accepts outward category %s',
    (category) => {
      const parsed = mergeGrnInputSchema.safeParse({
        ...base,
        sourceBagCategory: category,
        sourceQuantity: 50,
      });
      expect(parsed.success).toBe(true);
    },
  );

  it('accepts Hybrid informational rates alongside the category', () => {
    const parsed = mergeGrnInputSchema.safeParse({
      ...base,
      sourceBagCategory: 'Hybrid',
      sourceQuantity: 50,
      sourceBagPrice: 12.5,
      sourceSeasonalBagPrice: 30,
      sourceMonthlyBagPrice: 10,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceBagPrice).toBe(12.5);
    }
  });

  it('rejects negative quantity and non-positive rates', () => {
    expect(
      mergeGrnInputSchema.safeParse({ ...base, sourceBagCategory: 'Hybrid', sourceQuantity: -1 }).success,
    ).toBe(false);
    expect(
      mergeGrnInputSchema.safeParse({ ...base, sourceBagCategory: 'Hybrid', sourceQuantity: 10, sourceBagPrice: 0 }).success,
    ).toBe(false);
  });

  it('treats Mixed as Hybrid-family without reinterpretation', () => {
    expect(isHybridBagCategory('Mixed')).toBe(true);
    expect(isHybridBagCategory('Hybrid')).toBe(true);
    expect(isHybridBagCategory('S/B')).toBe(false);
    expect(isHybridBagCategory('Small & Big')).toBe(false);
  });

  describe('allocateHybridSplit (shared Outward + Internal Move allocator)', () => {
    it('fills Small first, remainder to Big, reconciled to the requested total', () => {
      expect(allocateHybridSplit(287, 50, 305)).toEqual({ smallBags: 287, bigBags: 18 });
      expect(allocateHybridSplit(0, 50, 50)).toEqual({ smallBags: 0, bigBags: 50 });
      expect(allocateHybridSplit(100, 0, 100)).toEqual({ smallBags: 100, bigBags: 0 });
    });

    it('matches the full remaining balance exactly (merge full-move case)', () => {
      const split = allocateHybridSplit(287, 50, 337);
      expect(split.smallBags + split.bigBags).toBe(337);
      expect(split).toEqual({ smallBags: 287, bigBags: 50 });
    });
  });
});
