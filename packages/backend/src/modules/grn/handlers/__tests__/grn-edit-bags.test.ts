import { describe, expect, it } from 'vitest';
import { resolveBagEdit, wantsBagsChange } from '../grn-edit-bags.js';

describe('grn-edit-bags (resolveBagEdit & wantsBagsChange)', () => {
  it('detects when bags change is requested', () => {
    expect(wantsBagsChange({ reason: 'Audit' })).toBe(false);
    expect(wantsBagsChange({ reason: 'Audit', bagType: 'S/B' })).toBe(true);
    expect(wantsBagsChange({ reason: 'Audit', bags: 100 })).toBe(true);
    expect(wantsBagsChange({ reason: 'Audit', smallBags: 50 })).toBe(true);
    expect(wantsBagsChange({ reason: 'Audit', bigBags: 50 })).toBe(true);
  });

  it('returns no-op updates when no bag fields are provided', () => {
    const res = resolveBagEdit({ reason: 'Audit' }, {
      bagType: 'S/B',
      bags: 100,
      smallBags: 60,
      bigBags: 40,
      isCompositionVerified: true,
    });
    expect(res.wantsBagsChange).toBe(false);
    expect(res.finalBagType).toBe('S/B');
    expect(res.finalBags).toBe(100);
    expect(res.finalSmallBags).toBe(60);
    expect(res.finalBigBags).toBe(40);
    expect(res.finalIsCompositionVerified).toBe(true);
    expect(res.update).toEqual({});
    expect(res.inwardUpdate).toEqual({});
  });

  it('preserves unverified S/B inward ledger quantity in smallQuantity rather than zeroing it out', () => {
    const res = resolveBagEdit(
      { reason: 'Weight recalibration', bags: 120 },
      {
        bagType: 'S/B',
        bags: 100,
        smallBags: 0,
        bigBags: 0,
        isCompositionVerified: false,
      },
    );

    expect(res.wantsBagsChange).toBe(true);
    expect(res.finalBags).toBe(120);
    expect(res.finalIsCompositionVerified).toBe(false);
    expect(res.update.smallBags).toBe(0);
    expect(res.update.bigBags).toBe(0);
    expect(res.update.isCompositionVerified).toBe(false);
    // Crucial fix: inwardUpdate must preserve finalBags in smallQuantity, NOT 0!
    expect(res.inwardUpdate.smallQuantity).toBe(120);
    expect(res.inwardUpdate.bigQuantity).toBe(0);
    expect(res.inwardUpdate.bagType).toBe('S/B');
  });

  it('correctly maps verified S/B composition to inward ledger quantities', () => {
    const res = resolveBagEdit(
      { reason: 'Tally physical intake', bags: 100, smallBags: 70, bigBags: 30 },
      {
        bagType: 'S/B',
        bags: 100,
        smallBags: 0,
        bigBags: 0,
        isCompositionVerified: false,
      },
    );

    expect(res.wantsBagsChange).toBe(true);
    expect(res.finalBags).toBe(100);
    expect(res.finalIsCompositionVerified).toBe(true);
    expect(res.update.smallBags).toBe(70);
    expect(res.update.bigBags).toBe(30);
    expect(res.update.isCompositionVerified).toBe(true);
    expect(res.inwardUpdate.smallQuantity).toBe(70);
    expect(res.inwardUpdate.bigQuantity).toBe(30);
    expect(res.inwardUpdate.bagType).toBe('S/B');
  });

  it('handles single bag type S with automatic composition verification', () => {
    const res = resolveBagEdit(
      { reason: 'Single bag correction', bagType: 'S', bags: 50 },
      {
        bagType: 'S/B',
        bags: 100,
        smallBags: 0,
        bigBags: 0,
        isCompositionVerified: false,
      },
    );

    expect(res.finalBagType).toBe('S');
    expect(res.finalBags).toBe(50);
    expect(res.finalIsCompositionVerified).toBe(true);
    expect(res.inwardUpdate.smallQuantity).toBe(50);
    expect(res.inwardUpdate.bigQuantity).toBe(0);
    expect(res.inwardUpdate.bagType).toBe('S');
  });

  it('handles single bag type B with automatic composition verification', () => {
    const res = resolveBagEdit(
      { reason: 'Single bag correction', bagType: 'B', bags: 80 },
      {
        bagType: 'S/B',
        bags: 100,
        smallBags: 0,
        bigBags: 0,
        isCompositionVerified: false,
      },
    );

    expect(res.finalBagType).toBe('B');
    expect(res.finalBags).toBe(80);
    expect(res.finalIsCompositionVerified).toBe(true);
    expect(res.inwardUpdate.smallQuantity).toBe(0);
    expect(res.inwardUpdate.bigQuantity).toBe(80);
    expect(res.inwardUpdate.bagType).toBe('B');
  });

  it('handles Hybrid bag type where composition is considered verified', () => {
    const res = resolveBagEdit(
      { reason: 'Convert to hybrid', bagType: 'Hybrid', bags: 200 },
      {
        bagType: 'S/B',
        bags: 100,
        smallBags: 60,
        bigBags: 40,
        isCompositionVerified: true,
      },
    );

    expect(res.finalBagType).toBe('Hybrid');
    expect(res.finalBags).toBe(200);
    expect(res.finalIsCompositionVerified).toBe(true);
    expect(res.inwardUpdate.bagType).toBe('Hybrid');
  });
});
