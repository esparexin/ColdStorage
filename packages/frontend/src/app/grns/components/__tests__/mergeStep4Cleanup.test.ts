import fs from 'node:fs';
import path from 'node:path';
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

  it('accepts repacked stock when count varies from consolidated pool (e.g. 30 bags instead of 38)', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      isRepackFilled: true,
      repackSmall: 10,
      repackBig: 20, // 30 bags instead of 38
      totalConsolidatedBags: 38,
    });
    expect(result).toBeNull();
  });

  it('validates hybrid repacked stock allowing variance', () => {
    const result = validateMergeSubmit({
      ...baseParams,
      destinationChamber: 'A-01,09',
      repackMode: true,
      repackBagType: 'Hybrid',
      isRepackFilled: true,
      repackQuantity: 30,
      repackBagPrice: 50,
      totalConsolidatedBags: 38,
    });
    expect(result).toBeNull();

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

  it('verifies MergeStep4RepackSection keeps storage mark read-only and allows manual merge date entry', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../MergeStep4RepackSection.tsx'), 'utf-8');

    // Storage mark is read-only for surviving Target GRN
    expect(source).toContain('id="merge-storage-mark"');
    expect(source).toContain('readOnly');
    expect(source).toContain('aria-label="Storage Mark (Target GRN, read-only)"');

    // Merge date allows manual entry (not readOnly, has onChange handler)
    expect(source).toContain('id="merge-date"');
    expect(source).toContain('onChange={(e) => onMovementDateChange?.(e.target.value)}');
    expect(source).not.toContain('aria-label="Merge Date (read-only)"');
  });
});
