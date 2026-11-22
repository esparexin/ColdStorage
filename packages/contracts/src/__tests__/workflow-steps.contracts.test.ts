import { describe, expect, it } from 'vitest';
import {
  TRANSFER_OWNERSHIP_STEPS,
  MERGE_GRN_STEPS,
  SORTING_REPACK_STEP_LABELS,
} from '../index.js';

describe('Workflow Steps SSOT Contracts', () => {
  it('defines 4 sequential steps for Transfer Ownership with simple operator names', () => {
    expect(TRANSFER_OWNERSHIP_STEPS).toHaveLength(4);
    expect(TRANSFER_OWNERSHIP_STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(TRANSFER_OWNERSHIP_STEPS[0].label).toBe('1. Select (Customer)');
    expect(TRANSFER_OWNERSHIP_STEPS[0].stage).toBe('SELECTION');
    expect(TRANSFER_OWNERSHIP_STEPS[1].label).toBe('2. Bag Details');
    expect(TRANSFER_OWNERSHIP_STEPS[1].stage).toBe('COMPOSITION');
    expect(TRANSFER_OWNERSHIP_STEPS[2].label).toBe('3. Rent & Dues');
    expect(TRANSFER_OWNERSHIP_STEPS[2].stage).toBe('SETTLEMENT');
    expect(TRANSFER_OWNERSHIP_STEPS[3].label).toBe('4. Confirm & Save');
    expect(TRANSFER_OWNERSHIP_STEPS[3].stage).toBe('EXECUTION');
  });

  it('defines 4 sequential steps for Merge GRN with simple operator names', () => {
    expect(MERGE_GRN_STEPS).toHaveLength(4);
    expect(MERGE_GRN_STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(MERGE_GRN_STEPS[0].label).toBe('1. Select (Batches)');
    expect(MERGE_GRN_STEPS[0].stage).toBe('SELECTION');
    expect(MERGE_GRN_STEPS[1].label).toBe('2. Bag Details');
    expect(MERGE_GRN_STEPS[1].stage).toBe('COMPOSITION');
    expect(MERGE_GRN_STEPS[2].label).toBe('3. Rent & Dues');
    expect(MERGE_GRN_STEPS[2].stage).toBe('SETTLEMENT');
    expect(MERGE_GRN_STEPS[3].label).toBe('4. Confirm & Save');
    expect(MERGE_GRN_STEPS[3].stage).toBe('EXECUTION');
  });

  it('defines canonical 2-phase gated labels for Sorting & Repacking', () => {
    expect(SORTING_REPACK_STEP_LABELS.step1).toBe('Step 1: Verify Bags & Bill Rent');
    expect(SORTING_REPACK_STEP_LABELS.step2).toBe('Step 2: Repack & Service Bill');
  });
});
