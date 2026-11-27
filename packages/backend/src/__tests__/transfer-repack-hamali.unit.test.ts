import { describe, expect, it } from 'vitest';
import { buildTransferGrnUpdateFields } from '../modules/internal-movement/handlers/transfer-ownership.helper.js';

describe('Transfer Ownership Repacking Hamali Labor (Unit)', () => {
  const sampleCustomer = { id: 'cust-transferee-01', name: 'Sri Krishna Agro Traders' };
  const baseInput = {
    grnId: 'grn-001',
    newCustomerId: 'cust-transferee-01',
    movementDate: '2026-11-20',
    remarks: 'Buyer requested rebagging into standard 50kg bags',
  };

  it('records repack hamaliAmount and hamaliRate on surviving GRN when repacking labor is assessed', () => {
    const fields = buildTransferGrnUpdateFields({
      newCustomer: sampleCustomer,
      finalChamber: 'CH-03',
      resultingBagType: 'S/B',
      finalBags: 120,
      finalSmall: 80,
      finalBig: 40,
      updatedRemarks: 'Transferred and repacked',
      referenceWeight: 6000,
      effectiveObligation: 0,
      isHybrid: false,
      input: {
        ...baseInput,
        repackedSmallBags: 80,
        repackedBigBags: 40,
      },
      repackHamaliCharge: 900,
      repackHamaliRate: 7.5,
    });

    expect(fields.customerId).toBe('cust-transferee-01');
    expect(fields.customerName).toBe('Sri Krishna Agro Traders');
    expect(fields.chamber).toBe('CH-03');
    expect(fields.bags).toBe(120);
    expect(fields.smallBags).toBe(80);
    expect(fields.bigBags).toBe(40);
    expect(fields.hamaliAmount).toBe(900);
    expect(fields.hamaliRate).toBe(7.5);
  });

  it('leaves hamaliAmount and hamaliRate untouched when transfer does not involve repacking labor', () => {
    const fields = buildTransferGrnUpdateFields({
      newCustomer: sampleCustomer,
      finalChamber: 'CH-01',
      resultingBagType: 'S/B',
      finalBags: 100,
      finalSmall: 60,
      finalBig: 40,
      updatedRemarks: 'Transferred as-is',
      referenceWeight: null,
      effectiveObligation: 0,
      isHybrid: false,
      input: baseInput,
      repackHamaliCharge: 0,
      repackHamaliRate: 0,
    });

    expect(fields.customerId).toBe('cust-transferee-01');
    expect(fields.bags).toBe(100);
    expect(fields.hamaliAmount).toBeUndefined();
    expect(fields.hamaliRate).toBeUndefined();
  });
});
