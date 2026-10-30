import { describe, expect, it } from 'vitest';
import {
  operationalBagTypeSchema,
  repackGrnInputSchema,
  sortGrnInputSchema,
  toOperationalBagType,
} from '../index.js';

describe('Contracts: GRN Sorting and Repack Bag Type Contracts', () => {
  it('operationalBagTypeSchema strictly accepts S/B and Hybrid and rejects S, B, S+B', () => {
    expect(operationalBagTypeSchema.safeParse('S/B').success).toBe(true);
    expect(operationalBagTypeSchema.safeParse('Hybrid').success).toBe(true);

    expect(operationalBagTypeSchema.safeParse('S').success).toBe(false);
    expect(operationalBagTypeSchema.safeParse('B').success).toBe(false);
    expect(operationalBagTypeSchema.safeParse('S+B').success).toBe(false);
    expect(operationalBagTypeSchema.safeParse('Modern').success).toBe(false);
  });

  it('toOperationalBagType maps canonical and legacy bag types to operational category', () => {
    expect(toOperationalBagType('S/B')).toBe('S/B');
    expect(toOperationalBagType('S')).toBe('S/B');
    expect(toOperationalBagType('B')).toBe('S/B');
    expect(toOperationalBagType('S+B')).toBe('S/B');
    expect(toOperationalBagType(null)).toBe('S/B');
    expect(toOperationalBagType(undefined)).toBe('S/B');

    expect(toOperationalBagType('Hybrid')).toBe('Hybrid');
    expect(toOperationalBagType('Modern')).toBe('Hybrid');
    expect(toOperationalBagType('Mixed')).toBe('Hybrid');
  });

  it('sortGrnInputSchema accepts operational bag types and rejects obsolete independent options', () => {
    const validSb = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'S/B',
      confirmedBags: 100,
    });
    expect(validSb.success).toBe(true);

    const validHybrid = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'Hybrid',
      confirmedBags: 100,
    });
    expect(validHybrid.success).toBe(true);

    const invalidS = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'S',
      confirmedBags: 100,
    });
    expect(invalidS.success).toBe(false);

    const invalidB = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'B',
      confirmedBags: 100,
    });
    expect(invalidB.success).toBe(false);
  });

  it('repackGrnInputSchema accepts operational bag types and rejects obsolete independent options', () => {
    const validSb = repackGrnInputSchema.safeParse({
      grnId: 'grn-1',
      resultingBagType: 'S/B',
      repackedSmallBags: 60,
      repackedBigBags: 40,
      remarks: 'Standard repacking',
    });
    expect(validSb.success).toBe(true);

    const validHybrid = repackGrnInputSchema.safeParse({
      grnId: 'grn-1',
      resultingBagType: 'Hybrid',
      repackedQuantity: 100,
      remarks: 'Standard repacking',
    });
    expect(validHybrid.success).toBe(true);

    const invalidS = repackGrnInputSchema.safeParse({
      grnId: 'grn-1',
      resultingBagType: 'S',
      remarks: 'Invalid bag type',
    });
    expect(invalidS.success).toBe(false);

    const invalidB = repackGrnInputSchema.safeParse({
      grnId: 'grn-1',
      resultingBagType: 'B',
      remarks: 'Invalid bag type',
    });
    expect(invalidB.success).toBe(false);
  });
});
