import { describe, expect, it } from 'vitest';
import {
  validateCreateGrnForm,
  toDateInput,
  buildEditGrnPayload,
  buildCreateGrnPayload,
  type CreateGrnState,
} from '../createGrnForm.helper';

function makeState(overrides: Partial<CreateGrnState> = {}): CreateGrnState {
  return {
    createGrnNumber: '0001',
    createCustomerId: 'cust-1',
    createCommodityId: 'cmd-1',
    createChamber: 'CH-01',
    createBags: 100,
    createBagType: 'S/B',
    createRentType: 'Seasonal',
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
  } as unknown as import('@cold-storage/contracts').Grn;

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
      createCustomerId: 'cust-2',
      createDate: '2026-10-06',
      createCommodityId: 'cmd-2',
      createChamber: 'CH-05',
      createBags: 300,
      createBagType: 'B',
      createRentType: 'Monthly',
      createRentMonths: 6,
      createRentAmount: 6000,
      createBagPrice: 80,
      createPartyMark: 'PM-99',
      createVehicleNumber: 'UP32AA1111',
      createRemarks: 'Bay relabeled',
    });

    expect(hasChanges).toBe(true);
    expect(payload.chamber).toBe('CH-05');
    expect(payload.partyMark).toBe('PM-99');
    expect(payload.vehicleNumber).toBe('UP32AA1111');
    expect(payload.remarks).toBe('Bay relabeled');
    expect(payload.customerId).toBeUndefined();
    expect(payload.date).toBeUndefined();
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

describe('createGrnForm Total Bags and Logistics validation', () => {
  it('validates Total Bags as positive whole number', () => {
    expect(validateCreateGrnForm(makeState({ createBags: 100 })).errors.bags).toBeUndefined();
    expect(validateCreateGrnForm(makeState({ createBags: '' })).errors.bags).toBe('Total Bags is required (a positive whole number)');
    expect(validateCreateGrnForm(makeState({ createBags: 0 })).errors.bags).toBe('Total Bags is required (a positive whole number)');
    expect(validateCreateGrnForm(makeState({ createBags: 2.5 })).errors.bags).toBe('Total Bags is required (a positive whole number)');
  });

  it('validates chamber and customer presence', () => {
    expect(validateCreateGrnForm(makeState({ createCustomerId: '' })).errors.customer).toBe('Please select a customer');
    expect(validateCreateGrnForm(makeState({ createChamber: '' })).errors.chamber).toBe('Chamber is required');
    expect(validateCreateGrnForm(makeState({ createCommodityId: '' })).errors.commodity).toBe('Please select a commodity');
  });

  it('validates party mark length constraint', () => {
    expect(validateCreateGrnForm(makeState({ createPartyMark: 'A'.repeat(25) })).errors.partyMark).toBe('Party mark cannot exceed 20 characters');
  });

  it('buildCreateGrnPayload constructs clean inward payload without rate or bagType assumptions', () => {
    const payload = buildCreateGrnPayload({
      facilityId: 'fac-1',
      inwardDate: new Date('2026-10-06T00:00:00Z'),
      grnNumber: '0001',
      customerId: 'cust-1',
      commodityId: 'cmd-1',
      chamber: 'CH-01',
      bags: 100,
      rentType: 'Seasonal',
      partyMark: 'PM-1',
      vehicleNumber: 'UP32AA1111',
      remarks: 'Inward entry',
    });
    expect(payload.grnNumber).toBe('0001');
    expect(payload.bags).toBe(100);
    expect(payload.rentType).toBe('Seasonal');
    expect(payload.partyMark).toBe('PM-1');
    expect(payload.bagType).toBeUndefined();
    expect(payload.rentAmount).toBeUndefined();
    expect(payload.smallBagPrice).toBeUndefined();
    expect(payload.bigBagPrice).toBeUndefined();
  });

  it('validates bagType requirement and S+B bag composition', () => {
    expect(validateCreateGrnForm(makeState({ createBagType: '' })).errors.bagType).toBe(
      'Please select a Bag Type (S/B or Hybrid)',
    );
    const valid = validateCreateGrnForm(makeState({
      createBags: 100, createBagType: 'S+B', createSmallBags: 60, createBigBags: 40,
    }));
    expect(valid.errors.smallBags).toBeUndefined();
    expect(valid.errors.bigBags).toBeUndefined();

    const mismatch = validateCreateGrnForm(makeState({
      createBags: 100, createBagType: 'S+B', createSmallBags: 50, createBigBags: 40,
    }));
    expect(mismatch.errors.smallBags).toBe('Small (50) + Big (40) must equal Total (100)');

    const negative = validateCreateGrnForm(makeState({
      createBags: 100, createBagType: 'S+B', createSmallBags: -5, createBigBags: 105,
    }));
    expect(negative.errors.smallBags).toBe('Small bags must be a non-negative whole number');
  });

  it('buildCreateGrnPayload populates bagType and verified splits for S, B, S+B and Hybrid', () => {
    const sPayload = buildCreateGrnPayload({
      facilityId: 'f1', inwardDate: new Date(), grnNumber: '0001', customerId: 'c1',
      commodityId: 'cmd1', chamber: 'CH-1', bags: 100, rentType: 'Seasonal', bagType: 'S',
    });
    expect(sPayload.bagType).toBe('S');
    expect(sPayload.smallBags).toBe(100);

    const sbPayload = buildCreateGrnPayload({
      facilityId: 'f1', inwardDate: new Date(), grnNumber: '0002', customerId: 'c1',
      commodityId: 'cmd1', chamber: 'CH-1', bags: 100, rentType: 'Seasonal',
      bagType: 'S+B', smallBags: 70, bigBags: 30,
    });
    expect(sbPayload.bagType).toBe('S+B');
    expect(sbPayload.smallBags).toBe(70);

    const hybridPayload = buildCreateGrnPayload({
      facilityId: 'f1', inwardDate: new Date(), grnNumber: '0003', customerId: 'c1',
      commodityId: 'cmd1', chamber: 'CH-1', bags: 100, rentType: 'Seasonal', bagType: 'Hybrid',
    });
    expect(hybridPayload.bagType).toBe('Hybrid');
    expect(hybridPayload.smallBags).toBe(100);
  });
});