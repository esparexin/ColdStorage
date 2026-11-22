export type WorkflowStageKey = 'SELECTION' | 'COMPOSITION' | 'SETTLEMENT' | 'EXECUTION';

export interface WizardStepDefinition {
  number: number;
  label: string;
  stage: WorkflowStageKey;
}

/**
 * Canonical operator-friendly 4-stage pipeline for Transfer Ownership.
 * Standard taxonomy:
 * 1. Select (Customer)
 * 2. Bag Details
 * 3. Rent & Dues
 * 4. Confirm & Save
 */
export const TRANSFER_OWNERSHIP_STEPS: readonly WizardStepDefinition[] = [
  { number: 1, label: '1. Select (Customer)', stage: 'SELECTION' },
  { number: 2, label: '2. Bag Details', stage: 'COMPOSITION' },
  { number: 3, label: '3. Rent & Dues', stage: 'SETTLEMENT' },
  { number: 4, label: '4. Confirm & Save', stage: 'EXECUTION' },
];

/**
 * Canonical operator-friendly 4-stage pipeline for Merge GRN.
 * Standard taxonomy:
 * 1. Select (Batches)
 * 2. Bag Details
 * 3. Rent & Dues
 * 4. Confirm & Save
 */
export const MERGE_GRN_STEPS: readonly WizardStepDefinition[] = [
  { number: 1, label: '1. Select (Batches)', stage: 'SELECTION' },
  { number: 2, label: '2. Bag Details', stage: 'COMPOSITION' },
  { number: 3, label: '3. Rent & Dues', stage: 'SETTLEMENT' },
  { number: 4, label: '4. Confirm & Save', stage: 'EXECUTION' },
];

/**
 * Canonical operator-friendly 2-phase gated labels for Sorting & Repacking.
 */
export const SORTING_REPACK_STEP_LABELS = {
  step1: 'Step 1: Verify Bags & Bill Rent',
  step2: 'Step 2: Repack & Service Bill',
} as const;
