import { describe, expect, it } from 'vitest';
import {
  clampSortBagAllocation,
  computeHamaliCharge,
  validateRepackOperation,
  validateSortConfirmation,
} from '../grnSorting.helper';

describe('grnSorting.helper', () => {
  describe('clampSortBagAllocation', () => {
    it('clamps bag allocation so sum cannot exceed available stock', () => {
      expect(clampSortBagAllocation(20, 5, 25)).toBe(20);
      expect(clampSortBagAllocation(25, 0, 25)).toBe(25);
      expect(clampSortBagAllocation(30, 0, 25)).toBe(25);
      expect(clampSortBagAllocation(15, 12, 25)).toBe(13);
      expect(clampSortBagAllocation(1233, 1533, 25)).toBe(0);
      expect(clampSortBagAllocation(-5, 0, 25)).toBe(0);
      expect(clampSortBagAllocation(NaN, 0, 25)).toBe(0);
    });
  });

  describe('validateSortConfirmation - Mandatory Stock Validation Matrix', () => {
    const avail = 25;

    it('accepts: 25 avail, 10 small, 15 big', () => {
      expect(
        validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 10, confirmedBigBags: 15 }, 'S/B', avail),
      ).toBeNull();
    });

    it('accepts: 25 avail, 12 small, 13 big', () => {
      expect(
        validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 12, confirmedBigBags: 13 }, 'S/B', avail),
      ).toBeNull();
    });

    it('accepts: 25 avail, 25 small, 0 big', () => {
      expect(
        validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 25, confirmedBigBags: 0 }, 'S/B', avail),
      ).toBeNull();
    });

    it('accepts: 25 avail, 0 small, 25 big', () => {
      expect(
        validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 0, confirmedBigBags: 25 }, 'S/B', avail),
      ).toBeNull();
    });

    it('rejects: 25 avail, 13 small, 13 big (26 > 25)', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 13, confirmedBigBags: 13 }, 'S/B', avail);
      expect(err).toContain('must match available stock (25)');
    });

    it('rejects: 25 avail, 1233 small, 1533 big (screenshot defect: 2766 > 25)', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 1233, confirmedBigBags: 1533 }, 'S/B', avail);
      expect(err).toContain('must match available stock (25)');
    });

    it('rejects: 25 avail, 26 small, 0 big', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 26, confirmedBigBags: 0 }, 'S/B', avail);
      expect(err).toContain('must match available stock (25)');
    });

    it('rejects: 25 avail, 0 small, 26 big', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 0, confirmedBigBags: 26 }, 'S/B', avail);
      expect(err).toContain('must match available stock (25)');
    });

    it('rejects: 25 avail, -1 small, 26 big', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: -1, confirmedBigBags: 26 }, 'S/B', avail);
      expect(err).toContain('non-negative whole number');
    });

    it('rejects: 25 avail, 10.5 small, 5 big', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 10.5, confirmedBigBags: 5 }, 'S/B', avail);
      expect(err).toContain('non-negative whole number');
    });

    it('does not require paymentMode', () => {
      expect(
        validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 10, confirmedBigBags: 15 }, 'S/B', avail),
      ).toBeNull();
    });
  });
  describe('validateSortConfirmation', () => {
    it('returns error when confirmed bag type is missing or does not match', () => {
      const errMissing = validateSortConfirmation({ confirmedBags: 100, paymentMode: 'Cash' }, 'S/B', 100);
      expect(errMissing).toContain('confirm the bag type');

      const errMismatch = validateSortConfirmation({ confirmedBagType: 'Hybrid', confirmedBags: 100, paymentMode: 'Cash' }, 'S/B', 100);
      expect(errMismatch).toContain('does not match existing bag type');

      const errHybridMismatch = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 100, paymentMode: 'Cash' }, 'Hybrid', 100);
      expect(errHybridMismatch).toContain('does not match existing bag type');
    });

    it('correctly maps legacy non-hybrid bag types (S, B, S+B) to confirmed S/B', () => {
      expect(validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 50, paymentMode: 'Cash' }, 'S', 50)).toBeNull();
      expect(validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 50, paymentMode: 'Cash' }, 'B', 50)).toBeNull();
      expect(validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 50, paymentMode: 'Cash' }, 'S+B', 50)).toBeNull();
    });

    it('returns error when confirmed bags does not match available stock', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 90, paymentMode: 'Cash' }, 'S/B', 100);
      expect(err).toContain('must match available stock');
    });

    it('returns error if total weight is negative or zero', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 100, totalBagsWeight: -10, paymentMode: 'Cash' }, 'S/B', 100);
      expect(err).toContain('positive number');
    });

    it('returns null when valid confirmation fields are provided', () => {
      const err = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedBags: 100, totalBagsWeight: 5000, paymentMode: 'Cash' }, 'S/B', 100);
      expect(err).toBeNull();
    });

    it('validates explicit small and big bag confirmation for S/B lots', () => {
      const errMismatch = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 60, confirmedBigBags: 30, paymentMode: 'Cash' }, 'S/B', 100);
      expect(errMismatch).toContain('must match available stock');

      const errNegative = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: -5, confirmedBigBags: 105, paymentMode: 'Cash' }, 'S/B', 100);
      expect(errNegative).toContain('non-negative whole number');

      const validSplit = validateSortConfirmation({ confirmedBagType: 'S/B', confirmedSmallBags: 60, confirmedBigBags: 40, paymentMode: 'Cash' }, 'S/B', 100);
      expect(validSplit).toBeNull();
    });

    it('allows unverified lots to confirm as Hybrid or S/B with manual counts', () => {
      // Unverified lot confirming as Hybrid
      const hybridRes = validateSortConfirmation(
        { confirmedBagType: 'Hybrid', confirmedBags: 100 },
        'S/B',
        100,
        false,
      );
      expect(hybridRes).toBeNull();

      // Unverified lot confirming as S/B requires explicit split
      const sbMissing = validateSortConfirmation(
        { confirmedBagType: 'S/B', confirmedBags: 100 },
        'S/B',
        100,
        false,
      );
      expect(sbMissing).toContain('Confirmed small bags must be a non-negative whole number');

      const sbValid = validateSortConfirmation(
        { confirmedBagType: 'S/B', confirmedSmallBags: 70, confirmedBigBags: 30 },
        'S/B',
        100,
        false,
      );
      expect(sbValid).toBeNull();
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
      const errNoReason = validateRepackOperation({ resultingBagType: 'S/B', repackedSmallBags: 50, repackedBigBags: 45, remarks: 'Repacked lot' }, 100);
      expect(errNoReason).toContain('Variance reason');

      const validWithReason = validateRepackOperation({ resultingBagType: 'S/B', repackedSmallBags: 50, repackedBigBags: 45, repackVarianceReason: 'Culled 5 rotten bags during sorting', remarks: 'Repacked lot' }, 100);
      expect(validWithReason).toBeNull();
    });

    it('requires remarks with at least 3 characters', () => {
      const err = validateRepackOperation({ resultingBagType: 'S/B', repackedSmallBags: 60, repackedBigBags: 40, remarks: 'ab' }, 100);
      expect(err).toContain('Remarks (minimum 3 characters)');
    });

    it('validates destination chamber when provided', () => {
      const errEmpty = validateRepackOperation({ resultingBagType: 'S/B', destinationChamber: '', repackedSmallBags: 60, repackedBigBags: 40, remarks: 'Repacked lot' }, 100);
      expect(errEmpty).toBe('Chamber is required');

      const validWithChamber = validateRepackOperation({ resultingBagType: 'S/B', destinationChamber: 'CH-03', repackedSmallBags: 60, repackedBigBags: 40, remarks: 'Repacked lot' }, 100);
      expect(validWithChamber).toBeNull();
    });

    it('validates Hybrid repacking with quantity and variance', () => {
      const err = validateRepackOperation({ resultingBagType: 'Hybrid', repackedQuantity: 0, remarks: 'Repack hybrid' }, 100);
      expect(err).toContain('greater than zero');

      const errVariance = validateRepackOperation({ resultingBagType: 'Hybrid', repackedQuantity: 90, remarks: 'Repack hybrid' }, 100);
      expect(errVariance).toContain('Variance reason');

      const valid = validateRepackOperation({ resultingBagType: 'Hybrid', repackedQuantity: 90, repackVarianceReason: 'Culled 10 bags', remarks: 'Repack hybrid' }, 100);
      expect(valid).toBeNull();
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
