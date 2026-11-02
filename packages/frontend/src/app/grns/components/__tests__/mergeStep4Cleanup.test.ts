import { describe, expect, it } from 'vitest';
import { validateMergeSubmit } from '../mergeStepValidation.helper';

describe('Merge Step 4 Cleanup & Chamber Validation', () => {
  const baseParams = {
    selectedSourceIds: ['src-1'],
    reason: 'Stock consolidation / Re-bagging lot',
    isTargetLoanHold: false,
    targetGrnNumber: '0004',
    repackMode: false,
    repackBagType: 'S/B' as const,
    isRepackFilled: false,
    repackSmall: '' as const,
    repackBig: '' as const,
    repackQuantity: '' as const,
    repackBagPrice: '' as const,
    repackSeasonalBagPrice: '' as const,
    repackMonthlyBagPrice: '' as const,
  };

  it('allows operator-entered destination chamber', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'CH-09',
    });
    expect(result).toBeNull();
  });

  it('allows changed/replaced chamber text', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'B-02',
    });
    expect(result).toBeNull();
  });

  it('rejects invalid chamber exceeding 20 characters', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A'.repeat(21),
    });
    expect(result).toBe('Chamber cannot exceed 20 characters');
  });

  it('requires destination chamber when repackMode is true', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: '   ',
      repackMode: true,
      isRepackFilled: true,
      repackSmall: 10,
      repackBig: 20,
    });
    expect(result).toBe('Destination chamber is required when repacking.');
  });

  it('accepts repacked stock when destination chamber is explicitly confirmed', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      isRepackFilled: true,
      repackSmall: 8,
      repackBig: 30,
      totalConsolidatedBags: 38,
    });
    expect(result).toBeNull();
  });

  it('rejects repacked stock when count does not equal consolidated pool of 38 bags', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      isRepackFilled: true,
      repackSmall: 10,
      repackBig: 20, // 30 bags instead of 38
      totalConsolidatedBags: 38,
    });
    expect(result).toBe('Repacked bag count (30) must equal consolidated pool of 38 bags.');
  });

  it('validates hybrid repacked stock against consolidated pool of 38 bags', () => {
    const mismatch = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      repackBagType: 'Hybrid',
      isRepackFilled: true,
      repackQuantity: 30,
      repackBagPrice: 50,
      totalConsolidatedBags: 38,
    });
    expect(mismatch).toBe('Repacked bag count (30) must equal consolidated pool of 38 bags.');

    const match = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      repackBagType: 'Hybrid',
      isRepackFilled: true,
      repackQuantity: 38,
      repackBagPrice: 50,
      totalConsolidatedBags: 38,
    });
    expect(match).toBeNull();
  });

  it('rejects submission when audit reason is under 5 characters', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      reason: 'move',
    });
    expect(result).toBe('Audit reason must be at least 5 characters.');
  });
});
