import { describe, expect, it } from 'vitest';
import {
  clampBagAllocation,
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
      confirmedSmallBags: 60,
      confirmedBigBags: 40,
    });
    expect(validSb.success).toBe(true);
    if (validSb.success) {
      expect(validSb.data.paymentMode).toBe('Cash');
      expect(validSb.data.confirmedSmallBags).toBe(60);
      expect(validSb.data.confirmedBigBags).toBe(40);
    }

    const invalidNegative = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'S/B',
      confirmedBags: 100,
      confirmedSmallBags: -5,
      confirmedBigBags: 105,
    });
    expect(invalidNegative.success).toBe(false);

    const invalidCompositionMismatch = sortGrnInputSchema.safeParse({
      grnId: 'grn-1',
      confirmedBagType: 'S/B',
      confirmedBags: 25,
      confirmedSmallBags: 1233,
      confirmedBigBags: 1533,
    });
    expect(invalidCompositionMismatch.success).toBe(false);
    if (!invalidCompositionMismatch.success) {
      expect(invalidCompositionMismatch.error.issues[0].message).toContain(
        'Sum of confirmed small and big bags must match confirmed total bags',
      );
    }

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
      destinationChamber: 'CH-01',
      repackedSmallBags: 60,
      repackedBigBags: 40,
      remarks: 'Standard repacking',
    });
    expect(validSb.success).toBe(true);

    const invalidEmptyChamber = repackGrnInputSchema.safeParse({
      grnId: 'grn-1',
      resultingBagType: 'S/B',
      destinationChamber: '',
      repackedSmallBags: 60,
      repackedBigBags: 40,
      remarks: 'Standard repacking',
    });
    expect(invalidEmptyChamber.success).toBe(false);

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

  it('clampBagAllocation in contracts SSOT prevents bag quantities from exceeding stock', () => {
    expect(clampBagAllocation(20, 5, 25)).toBe(20);
    expect(clampBagAllocation(30, 0, 25)).toBe(25);
    expect(clampBagAllocation(1233, 1533, 25)).toBe(0);
    expect(clampBagAllocation(50, 0, 25, 10)).toBe(10);
    expect(clampBagAllocation(-1, 0, 25)).toBe(0);
  });
});
