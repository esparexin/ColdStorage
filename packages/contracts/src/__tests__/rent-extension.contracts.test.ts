import { describe, expect, it } from 'vitest';
import {
  calculateExtensionRent,
  extensionSnapshotDate,
  finalizeExtensionInputSchema,
  overrideExtensionInputSchema,
  resolveExtensionFinalAmount,
  seasonYearForInwardDate,
  totalRentDue,
} from '../rent-extension.js';

describe('rent-extension contracts', () => {
  it('maps inward dates to the owning season year', () => {
    expect(seasonYearForInwardDate(new Date(2026, 2, 1))).toBe(2026); // Mar
    expect(seasonYearForInwardDate(new Date(2026, 11, 31))).toBe(2026); // Dec
    expect(seasonYearForInwardDate(new Date(2027, 0, 15))).toBe(2026); // Jan
    expect(seasonYearForInwardDate(new Date(2027, 1, 28))).toBe(2026); // Feb
  });

  it('freezes snapshots to month-start Jan 01 / Feb 01 after the season', () => {
    expect(extensionSnapshotDate(2026, 'JANUARY')).toEqual(new Date(2027, 0, 1));
    expect(extensionSnapshotDate(2026, 'FEBRUARY')).toEqual(new Date(2027, 1, 1));
  });

  it('charges a full month on snapshot bags with no proration', () => {
    expect(calculateExtensionRent(80, 300)).toBe(24000);
    expect(calculateExtensionRent(50, 300)).toBe(15000);
    expect(calculateExtensionRent(0, 300)).toBe(0);
    expect(calculateExtensionRent(80, 0)).toBe(0);
  });

  it('prefers an authorized manual override, else the calculated value', () => {
    expect(resolveExtensionFinalAmount(24000, null)).toBe(24000);
    expect(resolveExtensionFinalAmount(24000, 20000)).toBe(20000);
    expect(resolveExtensionFinalAmount(24000, 0)).toBe(24000);
  });

  it('totals original rent plus finalized extensions', () => {
    expect(totalRentDue(30000, [])).toBe(30000);
    expect(totalRentDue(30000, [24000, 15000])).toBe(69000);
  });

  it('validates finalize and override inputs', () => {
    expect(
      finalizeExtensionInputSchema.safeParse({ grnId: 'grn-1', seasonYear: 2026, period: 'JANUARY' })
        .success,
    ).toBe(true);
    expect(
      finalizeExtensionInputSchema.safeParse({ grnId: 'grn-1', seasonYear: 2026, period: 'MARCH' })
        .success,
    ).toBe(false);
    expect(
      overrideExtensionInputSchema.safeParse({ manualAmount: 20000, reason: 'Spoilage rebate OK' })
        .success,
    ).toBe(true);
    expect(
      overrideExtensionInputSchema.safeParse({ manualAmount: 20000, reason: 'ok' }).success,
    ).toBe(false);
    expect(
      overrideExtensionInputSchema.safeParse({ manualAmount: -5, reason: 'Valid reason here' })
        .success,
    ).toBe(false);
  });
});
