import { describe, expect, it } from 'vitest';
import { formatOutwardDeliveryTxNote } from '../delivery-note.helper.js';

describe('formatOutwardDeliveryTxNote (SSOT)', () => {
  it('formats outward delivery note with Small and Big bag breakdown when remarks are omitted', () => {
    const note = formatOutwardDeliveryTxNote({
      withdrawnTotal: 21,
      finalSmall: 5,
      finalBig: 16,
      isHybrid: false,
      challanNumber: 'CHL-25-26-0001',
    });

    expect(note).toBe('Outward Delivery: 21 bags (Small -5, Big -16) via Challan #CHL-25-26-0001');
  });

  it('formats outward delivery note with Small and Big breakdown appending custom remarks', () => {
    const note = formatOutwardDeliveryTxNote({
      withdrawnTotal: 21,
      finalSmall: 5,
      finalBig: 16,
      isHybrid: false,
      challanNumber: 'CHL-25-26-0001',
      customRemarks: 'Dispatched via truck MH12AB1234',
    });

    expect(note).toBe(
      'Outward Delivery: 21 bags (Small -5, Big -16) via Challan #CHL-25-26-0001 - Dispatched via truck MH12AB1234',
    );
  });

  it('formats outward delivery note with Hybrid breakdown for hybrid lot', () => {
    const note = formatOutwardDeliveryTxNote({
      withdrawnTotal: 21,
      finalSmall: 0,
      finalBig: 0,
      isHybrid: true,
      challanNumber: 'CHL-25-26-0002',
    });

    expect(note).toBe('Outward Delivery: 21 bags (Hybrid -21) via Challan #CHL-25-26-0002');
  });

  it('formats outward delivery note for hybrid lot with custom remarks', () => {
    const note = formatOutwardDeliveryTxNote({
      withdrawnTotal: 21,
      finalSmall: 0,
      finalBig: 0,
      isHybrid: true,
      challanNumber: 'CHL-25-26-0002',
      customRemarks: 'Direct market delivery',
    });

    expect(note).toBe(
      'Outward Delivery: 21 bags (Hybrid -21) via Challan #CHL-25-26-0002 - Direct market delivery',
    );
  });
});
