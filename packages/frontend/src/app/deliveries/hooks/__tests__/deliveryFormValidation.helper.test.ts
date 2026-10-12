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
    createVehicleNumber: 'UP32AA1111',
    createGpNumber: 'GP-0001',
    createDriverName: 'Ramesh Singh',
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

  it('rejects delivery date earlier than inward receipt date', () => {
    const result = validateDeliveryForm(
      makeInput({
        createDate: '2024-05-10',
        selectedGrnDate: new Date('2024-06-01'),
      }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.date).toBe('Delivery date cannot be earlier than Inward date');
  });

  it('accepts delivery date on or after inward receipt date', () => {
    const result = validateDeliveryForm(
      makeInput({
        createDate: '2024-06-01',
        selectedGrnDate: new Date('2024-06-01'),
      }),
    );
    expect(result.isValid).toBe(true);
    expect(result.errors.date).toBeUndefined();
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

  it('rejects missing vehicle registration', () => {
    const result = validateDeliveryForm(makeInput({ createVehicleNumber: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.vehicleNumber).toBe('Vehicle registration is required');
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

  it('rejects missing Gate Pass number', () => {
    const result = validateDeliveryForm(makeInput({ createGpNumber: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.gpNumber).toBe('Gate Pass number is required');
  });

  it('rejects missing driver name', () => {
    const result = validateDeliveryForm(makeInput({ createDriverName: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.driverName).toBe('Driver name is required');
  });

  it('allows small and big bags from an unsegregated S+B combined pool as long as total is within lot size', () => {
    const result = validateDeliveryForm(
      makeInput({
        smallBags: 50,
        bigBags: 20,
        totalWithdrawingBags: 70,
        availableSmall: 200,
        availableBig: 0,
        availableTotal: 200,
        isCombinedPool: true,
      }),
    );
    expect(result.isValid).toBe(true);
    expect(result.errors.smallBags).toBeUndefined();
    expect(result.errors.bigBags).toBeUndefined();
    expect(result.errors.bags).toBeUndefined();
  });

  it('supports all valid compositions for 200 bags (200S+0B, 0S+200B, 10S+190B) in combined pool', () => {
    const scenarios = [
      { small: 200, big: 0 },
      { small: 0, big: 200 },
      { small: 10, big: 190 },
    ];
    for (const s of scenarios) {
      const res = validateDeliveryForm(
        makeInput({
          smallBags: s.small,
          bigBags: s.big,
          totalWithdrawingBags: s.small + s.big,
          availableSmall: 200,
          availableBig: 0,
          availableTotal: 200,
          isCombinedPool: true,
        }),
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.bags).toBeUndefined();
      expect(res.errors.smallBags).toBeUndefined();
      expect(res.errors.bigBags).toBeUndefined();
    }
  });
});
