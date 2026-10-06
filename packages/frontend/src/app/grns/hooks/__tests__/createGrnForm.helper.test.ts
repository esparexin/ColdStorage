import { describe, expect, it } from 'vitest';
import { validateCreateGrnForm, toDateInput, buildEditGrnPayload, type CreateGrnState } from '../createGrnForm.helper';

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

describe('createGrnForm toDateInput helper', () => {
  it('formats Date instances and ISO strings to YYYY-MM-DD', () => {
    expect(toDateInput('2026-10-05T12:00:00Z')).toBe('2026-10-05');
    expect(toDateInput(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
  });

  it('returns empty string for null, undefined or invalid dates', () => {
    expect(toDateInput(null)).toBe('');
    expect(toDateInput(undefined)).toBe('');
    expect(toDateInput('invalid-date')).toBe('');
  });
});

describe('createGrnForm buildEditGrnPayload helper', () => {
  const baseGrn = {
    id: 'grn-1',
    grnNumber: 'GRN-26-27-0001',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    customerName: 'Ramesh Patel',
    commodityId: 'cmd-1',
    commodityName: 'Potato',
    date: new Date('2026-10-05T00:00:00Z'),
    chamber: 'CH-01',
    bags: 200,
    bagType: 'S' as const,
    rentType: 'Seasonal' as const,
    rentAmount: 5000,
    status: 'OPEN' as const,
    inwardReceiptNumber: 'RCPT-26-27-0001',
    createdAt: new Date('2026-10-05T00:00:00Z'),
    updatedAt: new Date('2026-10-05T00:00:00Z'),
  };

  it('reports hasChanges false when no values are modified', () => {
    const { hasChanges, payload } = buildEditGrnPayload({
      initialGrn: baseGrn,
      structuralLocked: false,
      createCustomerId: 'cust-1',
      createDate: '2026-10-05',
      createCommodityId: 'cmd-1',
      createChamber: 'CH-01',
      createBags: 200,
      createBagType: 'S',
      createRentType: 'Seasonal',
      createRentMonths: '',
      createRentAmount: 5000,
      createBagPrice: '',
    });

    expect(hasChanges).toBe(false);
    expect(payload.reason).toBe('Inward details updated via Inward edit');
  });

  it('captures descriptive edits when structural fields are locked', () => {
    const { hasChanges, payload } = buildEditGrnPayload({
      initialGrn: baseGrn,
      structuralLocked: true,
      createCustomerId: 'cust-2', // Should NOT be included
      createDate: '2026-10-06',   // Should NOT be included
      createCommodityId: 'cmd-2', // Should NOT be included
      createChamber: 'CH-05',     // Allowed
      createBags: 300,            // Should NOT be included
      createBagType: 'B',         // Should NOT be included
      createRentType: 'Monthly',  // Should NOT be included
      createRentMonths: 6,
      createRentAmount: 6000,
      createBagPrice: 80,
      createPartyMark: 'PM-99',   // Allowed
      createVehicleNumber: 'UP32AA1111', // Allowed
      createRemarks: 'Bay relabeled',     // Allowed
    });

    expect(hasChanges).toBe(true);
    expect(payload.chamber).toBe('CH-05');
    expect(payload.partyMark).toBe('PM-99');
    expect(payload.vehicleNumber).toBe('UP32AA1111');
    expect(payload.remarks).toBe('Bay relabeled');
    expect(payload.customerId).toBeUndefined();
    expect(payload.date).toBeUndefined();
    expect(payload.commodityId).toBeUndefined();
    expect(payload.bags).toBeUndefined();
  });

  it('captures structural edits when structuralLocked is false', () => {
    const { hasChanges, payload } = buildEditGrnPayload({
      initialGrn: baseGrn,
      structuralLocked: false,
      createCustomerId: 'cust-2',
      createDate: '2026-10-05',
      createCommodityId: 'cmd-1',
      createChamber: 'CH-01',
      createBags: 250,
      createBagType: 'S',
      createRentType: 'Seasonal',
      createRentMonths: '',
      createRentAmount: 6250,
      createBagPrice: '',
    });

    expect(hasChanges).toBe(true);
    expect(payload.customerId).toBe('cust-2');
    expect(payload.bags).toBe(250);
    expect(payload.rentAmount).toBe(6250);
  });
});