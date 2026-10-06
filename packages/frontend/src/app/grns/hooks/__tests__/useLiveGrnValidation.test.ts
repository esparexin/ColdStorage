import { describe, expect, it } from 'vitest';
import { formatGrnDuplicateError, isDuplicateGrnError, isGrnInvalidState } from '../useLiveGrnValidation';

describe('useLiveGrnValidation helpers', () => {
  describe('formatGrnDuplicateError', () => {
    it('formats authoritative backend-matching duplicate GRN error message', () => {
      expect(formatGrnDuplicateError('0001')).toBe("GRN '0001' already exists for this facility.");
      expect(formatGrnDuplicateError('9999')).toBe("GRN '9999' already exists for this facility.");
    });

    it('trims whitespace when formatting error message', () => {
      expect(formatGrnDuplicateError('  0042  ')).toBe("GRN '0042' already exists for this facility.");
    });
  });

  describe('isGrnInvalidState', () => {
    it('always returns false in edit mode because GRN is locked', () => {
      expect(
        isGrnInvalidState({
          createGrnNumber: '',
          isEdit: true,
          fieldError: undefined,
          isCheckingGrn: false,
        }),
      ).toBe(false);

      expect(
        isGrnInvalidState({
          createGrnNumber: '0001',
          isEdit: true,
          fieldError: "GRN '0001' already exists for this facility.",
          isCheckingGrn: true,
        }),
      ).toBe(false);
    });

    it('marks empty or incomplete GRN as invalid in create mode', () => {
      expect(
        isGrnInvalidState({
          createGrnNumber: '',
          isEdit: false,
          fieldError: undefined,
          isCheckingGrn: false,
        }),
      ).toBe(true);

      expect(
        isGrnInvalidState({
          createGrnNumber: '1',
          isEdit: false,
          fieldError: undefined,
          isCheckingGrn: false,
        }),
      ).toBe(true);

      expect(
        isGrnInvalidState({
          createGrnNumber: '001',
          isEdit: false,
          fieldError: undefined,
          isCheckingGrn: false,
        }),
      ).toBe(true);
    });

    it('marks GRN as invalid while live check is in flight', () => {
      expect(
        isGrnInvalidState({
          createGrnNumber: '0001',
          isEdit: false,
          fieldError: undefined,
          isCheckingGrn: true,
        }),
      ).toBe(true);
    });

    it('marks GRN as invalid when field error is present', () => {
      expect(
        isGrnInvalidState({
          createGrnNumber: '0001',
          isEdit: false,
          fieldError: "GRN '0001' already exists for this facility.",
          isCheckingGrn: false,
        }),
      ).toBe(true);
    });

    it('marks GRN as valid when 4 digits, not checking, and no field error', () => {
      expect(
        isGrnInvalidState({
          createGrnNumber: '0001',
          isEdit: false,
          fieldError: undefined,
          isCheckingGrn: false,
        }),
      ).toBe(false);
    });
  });

  describe('isDuplicateGrnError', () => {
    it('identifies authoritative backend duplicate GRN error messages', () => {
      expect(isDuplicateGrnError("GRN '0001' already exists for this facility.")).toBe(true);
      expect(isDuplicateGrnError("GRN '9999' already exists for this facility.")).toBe(true);
      expect(isDuplicateGrnError("GRN already exists")).toBe(true);
      expect(isDuplicateGrnError("grn '0042' already exists")).toBe(true);
    });

    it('identifies MongoDB duplicate key violations on grnNumber index', () => {
      expect(isDuplicateGrnError("E11000 duplicate key error: facilityId_1_grnNumber_1 dup key")).toBe(true);
    });

    it('does not classify unrelated duplicate errors as GRN duplicate errors', () => {
      expect(isDuplicateGrnError("Bill Number 'RCPT-26-27-0001' already exists for this facility.")).toBe(false);
      expect(isDuplicateGrnError("Customer with name 'Agro' already exists in this facility")).toBe(false);
      expect(isDuplicateGrnError("Commodity with name 'Potato' already exists")).toBe(false);
      expect(isDuplicateGrnError("Chamber is required (max 20 characters)")).toBe(false);
    });
  });
});
