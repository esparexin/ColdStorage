import { describe, expect, it } from 'vitest';
import {
  computeHamaliCharge,
  validateRepackOperation,
  validateSortConfirmation,
} from '../grnSorting.helper';

describe('grnSorting.helper', () => {
  describe('validateSortConfirmation', () => {
    it('returns error when confirmed bag type is missing or does not match', () => {
      const errMissing = validateSortConfirmation(
        { confirmedBags: 100, paymentMode: 'Cash' },
        'S/B',
        100,
      );
      expect(errMissing).toContain('confirm the bag type');

      const errMismatch = validateSortConfirmation(
        { confirmedBagType: 'S', confirmedBags: 100, paymentMode: 'Cash' },
        'S/B',
        100,
      );
      expect(errMismatch).toContain('does not match existing bag type');
    });

    it('returns error when confirmed bags does not match available stock', () => {
      const err = validateSortConfirmation(
        { confirmedBagType: 'S/B', confirmedBags: 90, paymentMode: 'Cash' },
        'S/B',
        100,
      );
      expect(err).toContain('must match available stock');
    });

    it('returns error if total weight is negative or zero', () => {
      const err = validateSortConfirmation(
        { confirmedBagType: 'S/B', confirmedBags: 100, totalBagsWeight: -10, paymentMode: 'Cash' },
        'S/B',
        100,
      );
      expect(err).toContain('positive number');
    });

    it('returns null when valid confirmation fields are provided', () => {
      const err = validateSortConfirmation(
        { confirmedBagType: 'S/B', confirmedBags: 100, totalBagsWeight: 5000, paymentMode: 'Cash' },
        'S/B',
        100,
      );
      expect(err).toBeNull();
    });
  });

  describe('validateRepackOperation', () => {
    it('returns error when resulting bag type is not provided', () => {
      const err = validateRepackOperation({ repackedSmallBags: 50, repackedBigBags: 50, remarks: 'Repacked' }, 100);
      expect(err).toContain('select the resulting bag type');
    });

    it('returns error when repacked bags is zero or negative', () => {
      const err = validateRepackOperation({ resultingBagType: 'S/B', repackedSmallBags: 0, repackedBigBags: 0, remarks: 'Zero bags' }, 100);
      expect(err).toContain('greater than zero');
    });

    it('requires variance reason when repacked count differs from original count', () => {
      const errNoReason = validateRepackOperation({
        resultingBagType: 'S/B',
        repackedSmallBags: 50,
        repackedBigBags: 45, // 95 vs 100
        remarks: 'Repacked lot',
      }, 100);
      expect(errNoReason).toContain('Variance reason');

      const validWithReason = validateRepackOperation({
        resultingBagType: 'S/B',
        repackedSmallBags: 50,
        repackedBigBags: 45,
        repackVarianceReason: 'Culled 5 rotten bags during sorting',
        remarks: 'Repacked lot',
      }, 100);
      expect(validWithReason).toBeNull();
    });

    it('requires remarks with at least 3 characters', () => {
      const err = validateRepackOperation({
        resultingBagType: 'S/B',
        repackedSmallBags: 60,
        repackedBigBags: 40,
        remarks: 'ab',
      }, 100);
      expect(err).toContain('Remarks (minimum 3 characters)');
    });
  });

  describe('computeHamaliCharge', () => {
    it('computes labor charge accurately', () => {
      expect(computeHamaliCharge(100, 4)).toBe(400);
      expect(computeHamaliCharge(95, 3.5)).toBe(332.5);
      expect(computeHamaliCharge(0, 4)).toBe(0);
      expect(computeHamaliCharge(100, 0)).toBe(0);
    });
  });
});
