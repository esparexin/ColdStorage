import { describe, expect, it } from 'vitest';
import { appendHamaliRowIfNeeded } from '../../components/outwardRentBreakdown.helper';

/**
 * Pure resolution logic matching useCreateDeliveryForm:
 * Prioritizes matched.hamaliRate snapshot over live commodity master rate.
 */
function resolvePreviewHamaliRate(
  grnSnapshotRate: number | null | undefined,
  liveMasterRate: number | null | undefined,
): number {
  if (typeof grnSnapshotRate === 'number') {
    return grnSnapshotRate;
  }
  return typeof liveMasterRate === 'number' ? liveMasterRate : 0;
}

describe('Outward Delivery Hamali Rate Preview Resolution (Phase 3: Finding 2)', () => {
  it('uses snapshotted GRN rate (₹5) even when commodity master rate has changed to ₹10', () => {
    const grn = { id: 'grn-1', hamaliRate: 5 };
    const liveMaster = { hamaliRate: 10 };

    const effectiveRate = resolvePreviewHamaliRate(grn.hamaliRate, liveMaster.hamaliRate);
    expect(effectiveRate).toBe(5);

    const rows = appendHamaliRowIfNeeded([], 100, effectiveRate);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toBe('100 bags × ₹5.00 / bag');
    expect(rows[0].amount).toBe(500);
  });

  it('preserves valid zero-rate snapshot (₹0) without falling back to master rate (₹8)', () => {
    const grn = { id: 'grn-2', hamaliRate: 0 };
    const liveMaster = { hamaliRate: 8 };

    const effectiveRate = resolvePreviewHamaliRate(grn.hamaliRate, liveMaster.hamaliRate);
    expect(effectiveRate).toBe(0);

    const rows = appendHamaliRowIfNeeded([], 100, effectiveRate);
    expect(rows).toHaveLength(0); // Zero rate -> no hamali charge added
  });

  it('falls back to commodity master rate for legacy GRN without snapshot (null/undefined)', () => {
    const legacyGrnNull = { id: 'grn-legacy-1', hamaliRate: null };
    const legacyGrnUndefined = { id: 'grn-legacy-2', hamaliRate: undefined };
    const liveMaster = { hamaliRate: 7 };

    expect(resolvePreviewHamaliRate(legacyGrnNull.hamaliRate, liveMaster.hamaliRate)).toBe(7);
    expect(resolvePreviewHamaliRate(legacyGrnUndefined.hamaliRate, liveMaster.hamaliRate)).toBe(7);

    const rows = appendHamaliRowIfNeeded([], 50, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toBe('50 bags × ₹7.00 / bag');
    expect(rows[0].amount).toBe(350);
  });

  it('returns zero when both snapshot and master rates are absent', () => {
    expect(resolvePreviewHamaliRate(null, null)).toBe(0);
    expect(resolvePreviewHamaliRate(undefined, undefined)).toBe(0);
  });
});
