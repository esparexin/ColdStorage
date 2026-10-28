import { describe, expect, it } from 'vitest';
import type { GrnMovementEntry } from '@cold-storage/contracts';
import { parseMovementRow } from '../grnMovementView.helper';

describe('grnMovementView.helper parseMovementRow', () => {
  const baseEntry: GrnMovementEntry = {
    date: new Date('2026-10-11T00:00:00.000Z'),
    grnId: 'grn-1',
    grnNumber: '0015',
    type: 'INWARD',
    openingBags: 0,
    receivedBags: 100,
    deliveredBags: 0,
    closingBags: 100,
    smallBags: 100,
    bigBags: 0,
    remarks: 'Genesis Inward',
  };

  it('correctly parses genesis INWARD entry', () => {
    const res = parseMovementRow(baseEntry);
    expect(res.typeLabel).toBe('INWARD');
    expect(res.badgeType).toBe('inward');
    expect(res.totalDisplay).toBe('100');
    expect(res.isReceived).toBe(true);
    expect(res.notes).toBe('Genesis Inward');
  });

  it('correctly parses INTERNAL_MERGE_IN with source GRN extraction', () => {
    const res = parseMovementRow({
      ...baseEntry,
      type: 'INTERNAL_MERGE_IN',
      openingBags: 100,
      receivedBags: 631,
      closingBags: 731,
      smallBags: 631,
      bigBags: 0,
      remarks: 'Merged from GRNs 0011: Rebagging as per customer request',
    });
    expect(res.typeLabel).toBe('MERGE IN');
    expect(res.badgeType).toBe('mergeIn');
    expect(res.refNumber).toBe('From GRN 0011');
    expect(res.totalDisplay).toBe('631');
    expect(res.isReceived).toBe(true);
    expect(res.notes).toBe('Rebagging as per customer request');
  });

  it('correctly parses INTERNAL_MERGE_OUT with target GRN extraction', () => {
    const res = parseMovementRow({
      ...baseEntry,
      type: 'INTERNAL_MERGE_OUT',
      openingBags: 631,
      deliveredBags: 631,
      closingBags: 0,
      remarks: 'Merged into GRN 0015: Merged for customer Kalyan',
    });
    expect(res.typeLabel).toBe('MERGE OUT');
    expect(res.badgeType).toBe('mergeOut');
    expect(res.refNumber).toBe('To GRN 0015');
    expect(res.totalDisplay).toBe('631');
    expect(res.isReceived).toBe(false);
    expect(res.notes).toBe('Merged for customer Kalyan');
  });

  it('correctly parses OWNERSHIP_TRANSFER without bag quantities and with parties', () => {
    const res = parseMovementRow({
      ...baseEntry,
      type: 'OWNERSHIP_TRANSFER',
      openingBags: 100,
      deliveredBags: 0,
      closingBags: 100,
      smallBags: undefined,
      bigBags: undefined,
      remarks: 'Ownership transferred: Penchaliah → NITISH: Transferred as requested',
    });
    expect(res.typeLabel).toBe('TRANSFER');
    expect(res.badgeType).toBe('transfer');
    expect(res.refNumber).toBe('Penchaliah → NITISH');
    expect(res.smallDisplay).toBe('—');
    expect(res.bigDisplay).toBe('—');
    expect(res.totalDisplay).toBe('—');
    expect(res.notes).toBe('Transferred as requested');
  });

  it('correctly parses OUTWARD delivery with GP and challan numbers', () => {
    const res = parseMovementRow({
      ...baseEntry,
      type: 'FINAL_OUTWARD',
      openingBags: 731,
      deliveredBags: 731,
      closingBags: 0,
      smallBags: 731,
      bigBags: 0,
      gpNumber: 'GP-0001',
      challanNumber: 'CHL-26-27-0014',
      remarks: 'Final dispatch',
    });
    expect(res.typeLabel).toBe('OUTWARD');
    expect(res.badgeType).toBe('outward');
    expect(res.refNumber).toBe('GP-0001');
    expect(res.totalDisplay).toBe('731');
    expect(res.isReceived).toBe(false);
    expect(res.notes).toBe('Final dispatch');
  });

  it('correctly parses DELIVERY_REVERSAL', () => {
    const res = parseMovementRow({
      ...baseEntry,
      type: 'DELIVERY_REVERSAL',
      openingBags: 0,
      receivedBags: 100,
      deliveredBags: 100,
      closingBags: 100,
      challanNumber: 'CHL-26-27-0014',
      remarks: 'Truck breakdown',
    });
    expect(res.typeLabel).toBe('REVERSAL');
    expect(res.badgeType).toBe('reversal');
    expect(res.totalDisplay).toBe('100');
    expect(res.isReceived).toBe(true);
    expect(res.notes).toBe('Truck breakdown');
  });

  it('correctly parses INTERNAL_REPACK in and out entries', () => {
    const outRes = parseMovementRow({
      ...baseEntry,
      type: 'INTERNAL_REPACK',
      openingBags: 100,
      receivedBags: 0,
      deliveredBags: 100,
      closingBags: 0,
      remarks: 'Stock adjustment for repacking',
    });
    expect(outRes.typeLabel).toBe('REPACK OUT');
    expect(outRes.badgeType).toBe('mergeOut');
    expect(outRes.refNumber).toBe('Internal Repack');
    expect(outRes.totalDisplay).toBe('100');
    expect(outRes.isReceived).toBe(false);

    const inRes = parseMovementRow({
      ...baseEntry,
      type: 'INTERNAL_REPACK',
      openingBags: 0,
      receivedBags: 95,
      deliveredBags: 0,
      closingBags: 95,
      remarks: 'Repacked stock putaway',
    });
    expect(inRes.typeLabel).toBe('REPACK IN');
    expect(inRes.badgeType).toBe('mergeIn');
    expect(inRes.refNumber).toBe('Internal Repack');
    expect(inRes.totalDisplay).toBe('95');
    expect(inRes.isReceived).toBe(true);
  });
});
