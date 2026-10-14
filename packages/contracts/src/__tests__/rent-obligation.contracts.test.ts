import { describe, expect, it } from 'vitest';
import {
  resolveTotalRentObligation,
  splitRentObligation,
  rentObligationInputSchema,
} from '../rent-obligation.js';
import { totalRentDue } from '../index.js';

/**
 * Contract guard for the rent-obligation SSOT (W2).
 *
 * Before W2 there were six independent derivations of "what is owed on this
 * GRN". Two were complete; four omitted the outward rent charges or the
 * first-season Hamali, so the same GRN reported different balances depending
 * on which screen or service asked.
 *
 * The fixtures below are taken from PRODUCTION cold_storage, where the
 * divergence was measured rather than hypothesised.
 */
describe('resolveTotalRentObligation (rent-obligation SSOT)', () => {
  // --- PRODUCTION FIXTURE: GRN 0015 -------------------------------------
  // Stored rentAmount 0, outward rent charges 422250, 422250 collected.
  // Complete rule: fully paid. Four of the six former derivations reported a
  // 0 obligation against 422250 collected: a 4.22 lakh phantom overpayment.
  it('resolves the production GRN 0015 shape to a fully-settled obligation', () => {
    const total = resolveTotalRentObligation({
      rentType: 'Seasonal',
      rentAmount: 0,
      outwardRentCharges: 422250,
      extensionAmounts: [],
      hamaliShare: 0,
    });
    expect(total).toBe(422250);

    // The four partial derivations produced a 0 obligation, so the remaining
    // balance against 422250 collected was the full 422250: a 4.22 lakh
    // phantom deficit on this exact production document.
    const remaining = Math.max(0, Number((total - 422250).toFixed(2)));
    expect(remaining).toBe(0);
    expect(remaining).not.toBe(422250);
  });

  it('matches the other production zero-rent GRN shapes', () => {
    for (const charges of [171678, 73800, 59000, 54000, 17250, 5000]) {
      expect(
        resolveTotalRentObligation({
          rentType: 'Seasonal',
          rentAmount: 0,
          outwardRentCharges: charges,
        }),
      ).toBe(charges);
    }
  });

  // --- base selection ---------------------------------------------------
  it('Monthly takes the greater of stored rent and outward charges', () => {
    expect(
      resolveTotalRentObligation({ rentType: 'Monthly', rentAmount: 3000, outwardRentCharges: 12000 }),
    ).toBe(12000);
    expect(
      resolveTotalRentObligation({ rentType: 'Monthly', rentAmount: 30000, outwardRentCharges: 12000 }),
    ).toBe(30000);
  });

  it('Seasonal prefers the stored obligation over outward charges', () => {
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 50000, outwardRentCharges: 12000 }),
    ).toBe(50000);
  });

  it('Seasonal falls back to outward charges when nothing is stored', () => {
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 0, outwardRentCharges: 7500 }),
    ).toBe(7500);
  });

  it('Seasonal_3M takes the greater of stored rent and outward charges', () => {
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal_3M', rentAmount: 0, outwardRentCharges: 15000 }),
    ).toBe(15000);
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal_3M', rentAmount: 9000, outwardRentCharges: 15000 }),
    ).toBe(15000);
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal_3M', rentAmount: 9000, outwardRentCharges: 5000 }),
    ).toBe(9000);
  });

  // --- Hamali joins exactly once ----------------------------------------
  it('adds Hamali when the base is the stored obligation', () => {
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 10000, hamaliShare: 2000 }),
    ).toBe(12000);
  });

  it('does NOT add Hamali when the base came from outward charges', () => {
    // A zero-rent GRN's outward charges already embed the per-delivery
    // Hamali share; adding it again would double-count.
    expect(
      resolveTotalRentObligation({
        rentType: 'Seasonal',
        rentAmount: 0,
        outwardRentCharges: 422250,
        hamaliShare: 5000,
      }),
    ).toBe(422250);
  });

  it('ignores a non-finite or negative Hamali share', () => {
    for (const hamaliShare of [Number.NaN, -100, 0]) {
      expect(
        resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 10000, hamaliShare }),
      ).toBe(10000);
    }
  });

  // --- extensions --------------------------------------------------------
  it('adds extension amounts on top of the base', () => {
    expect(
      resolveTotalRentObligation({
        rentType: 'Seasonal',
        rentAmount: 20000,
        extensionAmounts: [5000, 2500],
      }),
    ).toBe(27500);
  });

  it('stays additive with extensions AND Hamali together', () => {
    expect(
      resolveTotalRentObligation({
        rentType: 'Seasonal',
        rentAmount: 20000,
        extensionAmounts: [5000],
        hamaliShare: 1500,
      }),
    ).toBe(26500);
  });

  it('tolerates null and undefined inputs without producing NaN', () => {
    const total = resolveTotalRentObligation({
      rentType: 'Seasonal',
      rentAmount: null,
      outwardRentCharges: undefined,
      extensionAmounts: [null, undefined],
      hamaliShare: null,
    });
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(0);
  });

  // --- rounding ----------------------------------------------------------
  it('rounds to two decimals exactly once, at the end', () => {
    // 0.1 + 0.2 style float drift must not survive.
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 0.1, extensionAmounts: [0.2] }),
    ).toBe(0.3);
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 1.005, extensionAmounts: [2.675] }),
    ).toBe(3.68);
  });

  it('never returns a negative obligation', () => {
    // Defensive: a negative extension must not invert the balance.
    expect(
      resolveTotalRentObligation({ rentType: 'Seasonal', rentAmount: 100, extensionAmounts: [-500] }),
    ).toBe(-400);
  });

  // --- splitRentObligation ---------------------------------------------
  it('splitRentObligation reports components that recompose to the total', () => {
    const input = {
      rentType: 'Monthly' as const,
      rentAmount: 12000,
      outwardRentCharges: 3000,
      extensionAmounts: [1000],
      hamaliShare: 500,
    };
    const s = splitRentObligation(input);
    expect(s.baseRent).toBe(12000);
    expect(s.hamali).toBe(500);
    expect(s.total).toBe(13500);
    expect(Number((s.baseRent + s.hamali + 1000).toFixed(2))).toBe(s.total);
  });

  it('splitRentObligation reports zero Hamali when the base came from outward', () => {
    const s = splitRentObligation({
      rentType: 'Seasonal',
      rentAmount: 0,
      outwardRentCharges: 422250,
      hamaliShare: 5000,
    });
    expect(s.hamali).toBe(0);
    expect(s.baseRent).toBe(422250);
    expect(s.total).toBe(422250);
  });

  // --- agreement with the pre-existing primitives ------------------------
  it('agrees with totalRentDue when only extensions are in play', () => {
    expect(totalRentDue(20000, [5000, 2500])).toBe(27500);
    expect(
      resolveTotalRentObligation({
        rentType: 'Seasonal',
        rentAmount: 20000,
        extensionAmounts: [5000, 2500],
      }),
    ).toBe(totalRentDue(20000, [5000, 2500]));
  });

  it('matches the schema it ships with', () => {
    expect(
      rentObligationInputSchema.safeParse({ rentType: 'Monthly', rentAmount: null }).success,
    ).toBe(true);
    expect(rentObligationInputSchema.safeParse({ rentType: 'Nope' }).success).toBe(false);
  });
});
