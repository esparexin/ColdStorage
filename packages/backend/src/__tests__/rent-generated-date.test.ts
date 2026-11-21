import { describe, expect, it } from 'vitest';
import { resolveRentGeneratedDate } from '../modules/rent/rent-summary.helper.js';

describe('resolveRentGeneratedDate SSOT', () => {
  it('1. returns grn.createdAt for upfront stored rent obligation', () => {
    const upfrontDate = new Date('2026-10-10T11:00:00.000Z');
    const genDate = resolveRentGeneratedDate({
      grnRentAmount: 5000,
      grnCreatedAt: upfrontDate,
      outwardRentCharges: 0,
      earliestOutwardCreatedAt: null,
    });
    expect(genDate).toEqual(upfrontDate);
  });

  it('2. returns earliest outward delivery createdAt when rent is generated at outward dispatch', () => {
    const outwardChallanDate = new Date('2026-10-14T09:15:00.000Z');
    const genDate = resolveRentGeneratedDate({
      grnRentAmount: 0,
      grnCreatedAt: new Date('2026-10-12T14:30:00.000Z'), // Inward created earlier
      outwardRentCharges: 2000,
      earliestOutwardCreatedAt: outwardChallanDate,
    });
    expect(genDate).toEqual(outwardChallanDate);
    // Ensures it did NOT substitute the inward creation date
    expect(genDate).not.toEqual(new Date('2026-10-12T14:30:00.000Z'));
  });

  it('3. returns extension finalizedAt when rent obligation is from extension', () => {
    const extDate = new Date('2027-01-15T10:00:00.000Z');
    const genDate = resolveRentGeneratedDate({
      grnRentAmount: 0,
      grnCreatedAt: null,
      outwardRentCharges: 0,
      earliestOutwardCreatedAt: null,
      extensions: [{ finalizedAt: extDate }],
    });
    expect(genDate).toEqual(extDate);
  });

  it('4. returns null (renders —) when no rent has been generated or historical timestamps are absent', () => {
    // "At Outward" with no outward deliveries yet
    const unbilledDate = resolveRentGeneratedDate({
      grnRentAmount: 0,
      grnCreatedAt: new Date('2026-10-12T14:30:00.000Z'),
      outwardRentCharges: 0,
      earliestOutwardCreatedAt: null,
    });
    expect(unbilledDate).toBeNull();

    // Missing persisted createdAt on stored rent
    const missingTimestamp = resolveRentGeneratedDate({
      grnRentAmount: 5000,
      grnCreatedAt: null,
      outwardRentCharges: 0,
      earliestOutwardCreatedAt: null,
    });
    expect(missingTimestamp).toBeNull();
  });
});
