import { describe, expect, it } from 'vitest';
import { validateCreateGrnForm, type CreateGrnState } from '../createGrnForm.helper';

function makeState(overrides: Partial<CreateGrnState> = {}): CreateGrnState {
  return {
    createGrnNumber: '0001',
    createCustomerId: 'cust-1',
    createCommodityId: 'cmd-1',
    createChamber: 'CH-01',
    createBags: 100,
    createBagType: 'S',
    createRentType: 'Seasonal',
    createRentMonths: 10,
    createRentAmount: 5000,
    createBagPrice: 50,
    createPartyMark: '',
    createVehicleNumber: '',
    ...overrides,
  };
}

describe('createGrnForm GR Number validation', () => {
  it.each(['0001', '9999', '0042'])('accepts the four-digit GR Number %s', (createGrnNumber) => {
    const { errors } = validateCreateGrnForm(makeState({ createGrnNumber }));

    expect(errors.grnNumber).toBeUndefined();
  });

  it.each([
    ['blank', ''],
    ['only whitespace', '   '],
    ['too short', '001'],
    ['too long', '00011'],
    ['letters mixed in', '00ab'],
  ])('rejects a GR Number that is %s', (_label, createGrnNumber) => {
    const { errors } = validateCreateGrnForm(makeState({ createGrnNumber }));

    expect(errors.grnNumber).toBe('GRN must be exactly 4 digits (numbers only)');
  });

  it('tolerates surrounding whitespace the way the submit path trims', () => {
    const { errors } = validateCreateGrnForm(makeState({ createGrnNumber: '  0001  ' }));

    expect(errors.grnNumber).toBeUndefined();
  });

  it('validates the GR Number before anything else, so the first error shown is the GRN', () => {
    const { errors } = validateCreateGrnForm(makeState({ createGrnNumber: '12', createCustomerId: '' }));

    expect(Object.keys(errors)).toEqual(['grnNumber', 'customer']);
  });
});