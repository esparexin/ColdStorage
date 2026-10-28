import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  validateStep2Proceed,
  validateStep3Proceed,
  validateMergeSubmit,
} from '../mergeStepValidation.helper';
import { DEFAULT_BAG_CONFIRMATION } from '../bagConfirmation.helper';

describe('mergeStepValidation.helper', () => {
  describe('validateStep2Proceed', () => {
    it('returns error when targetGrnId is missing', () => {
      expect(
        validateStep2Proceed({
          targetGrnId: '',
          isTargetLoanHold: false,
          targetGrnNumber: '1001',
          targetCurrentRemaining: 100,
          selectedSourceIds: ['src-1'],
        }),
      ).toBe('Please select the surviving target GRN.');
    });

    it('returns error when target has active loan hold', () => {
      expect(
        validateStep2Proceed({
          targetGrnId: 'tgt-1',
          isTargetLoanHold: true,
          targetGrnNumber: '1001',
          targetCurrentRemaining: 100,
          selectedSourceIds: ['src-1'],
        }),
      ).toBe("Target GRN '1001' has an active loan hold.");
    });

    it('returns error when target has zero remaining stock', () => {
      expect(
        validateStep2Proceed({
          targetGrnId: 'tgt-1',
          isTargetLoanHold: false,
          targetGrnNumber: '1001',
          targetCurrentRemaining: 0,
          selectedSourceIds: ['src-1'],
        }),
      ).toBe("Target GRN '1001' has zero remaining stock.");
    });

    it('returns error when no source GRNs are selected', () => {
      expect(
        validateStep2Proceed({
          targetGrnId: 'tgt-1',
          isTargetLoanHold: false,
          targetGrnNumber: '1001',
          targetCurrentRemaining: 50,
          selectedSourceIds: [],
        }),
      ).toBe('Please select at least one source GRN to merge.');
    });

    it('returns null when all inputs are valid', () => {
      expect(
        validateStep2Proceed({
          targetGrnId: 'tgt-1',
          isTargetLoanHold: false,
          targetGrnNumber: '1001',
          targetCurrentRemaining: 50,
          selectedSourceIds: ['src-1'],
        }),
      ).toBeNull();
    });
  });

  describe('validateStep3Proceed', () => {
    const sampleSource = {
      id: 'src-1',
      grnNumber: '2001',
      bags: 50,
      closingBags: 50,
    } as unknown as Grn;

    it('rejects S/B confirmation if small + big != closingBags', () => {
      expect(
        validateStep3Proceed({
          selectedSources: [sampleSource],
          sourceConfirmations: {
            'src-1': {
              ...DEFAULT_BAG_CONFIRMATION,
              category: 'S/B',
              smallBags: 20,
              bigBags: 20, // sum is 40, closingBags is 50
            },
          },
        }),
      ).toBe("Source GRN '2001': Confirmed Small (20) and Big (20) bags must equal 50 bags.");
    });

    it('accepts matching S/B confirmation', () => {
      expect(
        validateStep3Proceed({
          selectedSources: [sampleSource],
          sourceConfirmations: {
            'src-1': {
              ...DEFAULT_BAG_CONFIRMATION,
              category: 'S/B',
              smallBags: 30,
              bigBags: 20,
            },
          },
        }),
      ).toBeNull();
    });
  });

  describe('validateMergeSubmit', () => {
    it('validates minimum reason length', () => {
      expect(
        validateMergeSubmit({
          selectedSourceIds: ['src-1'],
          reason: 'abc',
          isTargetLoanHold: false,
          targetGrnNumber: '1001',
          repackMode: false,
          repackBagType: 'S/B',
          isRepackFilled: false,
          repackSmall: '',
          repackBig: '',
          repackQuantity: '',
          repackBagPrice: '',
          repackSeasonalBagPrice: '',
          repackMonthlyBagPrice: '',
        }),
      ).toBe('Audit reason must be at least 5 characters.');
    });
  });
});
