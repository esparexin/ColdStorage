import { describe, expect, it } from 'vitest';
import { validateDeliveryForm, type ValidateDeliveryFormInput } from '../deliveryFormValidation.helper';

function makeInput(overrides: Partial<ValidateDeliveryFormInput> = {}): ValidateDeliveryFormInput {
  return {
    createGrnId: 'grn-1',
    createDate: '2026-10-06T10:00',
    smallBags: 0,
    bigBags: 10,
    totalWithdrawingBags: 10,
    availableSmall: 50,
    availableBig: 50,
    createVehicleNumber: '',
    isLoanHoldActive: false,
    selectedGrnNumber: 'GRN-26-27-0001',
    ...overrides,
  };
}

describe('validateDeliveryForm', () => {
  it('returns valid for a properly filled delivery form', () => {
    const result = validateDeliveryForm(makeInput());
    expect(result.isValid).toBe(true);
    expect(result.modalError).toBeNull();
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects missing GRN selection', () => {
    const result = validateDeliveryForm(makeInput({ createGrnId: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.grn).toBe('Please select an inward GRN to withdraw stock from');
  });

  it('blocks when loan hold is active', () => {
    const result = validateDeliveryForm(makeInput({ isLoanHoldActive: true }));
    expect(result.isValid).toBe(false);
    expect(result.modalError).toContain('Active loan hold against this Bond');
  });

  it('rejects missing delivery date', () => {
    const result = validateDeliveryForm(makeInput({ createDate: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.date).toBe('Delivery date is required');
  });

  it('rejects future delivery date beyond tolerance', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = validateDeliveryForm(makeInput({ createDate: futureDate }));
    expect(result.isValid).toBe(false);
    expect(result.errors.date).toBe('Delivery date cannot be in the future');
  });

  it('rejects delivery with zero bags', () => {
    const result = validateDeliveryForm(
      makeInput({ smallBags: 0, bigBags: 0, totalWithdrawingBags: 0 }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.bags).toBe('Please enter at least 1 bag to deliver');
  });

  it('rejects delivery exceeding total available stock', () => {
    const result = validateDeliveryForm(
      makeInput({ smallBags: 60, bigBags: 50, totalWithdrawingBags: 110 }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.bags).toBe('Cannot deliver 110 bags (only 100 available)');
  });

  it('rejects small bags exceeding available stock', () => {
    const result = validateDeliveryForm(
      makeInput({ smallBags: 60, totalWithdrawingBags: 60, availableSmall: 50 }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.smallBags).toBe('Cannot deliver 60 small bags (only 50 available)');
  });

  it('rejects big bags exceeding available stock', () => {
    const result = validateDeliveryForm(
      makeInput({ bigBags: 60, totalWithdrawingBags: 60, availableBig: 50 }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.bigBags).toBe('Cannot deliver 60 big bags (only 50 available)');
  });

  it('rejects invalid vehicle registration format', () => {
    const result = validateDeliveryForm(makeInput({ createVehicleNumber: 'INVALID_VEHICLE' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.vehicleNumber).toContain('Vehicle registration must be in standard Indian format');
  });

  it('accepts valid Indian vehicle format', () => {
    const result = validateDeliveryForm(makeInput({ createVehicleNumber: 'UP32AA1111' }));
    expect(result.isValid).toBe(true);
    expect(result.errors.vehicleNumber).toBeUndefined();
  });
});
