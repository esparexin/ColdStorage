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
import {
  calculateOutwardSeasonalBreakdown,
  deriveModernRateVisibility,
  resolveSeasonalElapsedPeriods,
} from '../seasonal-periods.js';

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

  it('freezes the seasonal renewal snapshot to Mar 01 of the season year', () => {
    expect(extensionSnapshotDate(2027, 'SEASON')).toEqual(new Date(2027, 2, 1));
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

  it('totals a recurring same-GRN lifecycle across seasons', () => {
    // Season 2026 (1200) + Jan (120) + Feb (120) + Season 2027 renewal (1200)
    expect(totalRentDue(1200, [120, 120, 1200])).toBe(2640);
  });

  it('validates finalize and override inputs', () => {
    expect(
      finalizeExtensionInputSchema.safeParse({ grnId: 'grn-1', seasonYear: 2026, period: 'JANUARY' })
        .success,
    ).toBe(true);
    expect(
      finalizeExtensionInputSchema.safeParse({ grnId: 'grn-1', seasonYear: 2027, period: 'SEASON' })
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

  it('resolves elapsed seasonal and extension periods correctly under Option A', () => {
    // 1. Same season delivery (Jul 2024 to Nov 2024): 1 season only
    const p1 = resolveSeasonalElapsedPeriods('2024-07-10', '2024-11-20');
    expect(p1.map((p) => p.key)).toEqual(['SEASON_2024']);

    // 2. Extends into Jan 2025: Season 2024 + January 2025
    const p2 = resolveSeasonalElapsedPeriods('2024-07-10', '2025-01-15');
    expect(p2.map((p) => p.key)).toEqual(['SEASON_2024', 'JANUARY_2025']);

    // 3. Extends into Feb 2025: Season 2024 + January 2025 + February 2025
    const p3 = resolveSeasonalElapsedPeriods('2024-07-10', '2025-02-15');
    expect(p3.map((p) => p.key)).toEqual(['SEASON_2024', 'JANUARY_2025', 'FEBRUARY_2025']);

    // 4. Extends into March 2025: renewal triggered on March 1
    const p4 = resolveSeasonalElapsedPeriods('2024-07-10', '2025-03-05');
    expect(p4.map((p) => p.key)).toEqual(['SEASON_2024', 'JANUARY_2025', 'FEBRUARY_2025', 'SEASON_2025']);

    // 5. Multi-year storage (Jul 2024 to Oct 2026): 7 periods
    const p5 = resolveSeasonalElapsedPeriods('2024-07-10', '2026-10-11');
    expect(p5.map((p) => p.key)).toEqual([
      'SEASON_2024',
      'JANUARY_2025',
      'FEBRUARY_2025',
      'SEASON_2025',
      'JANUARY_2026',
      'FEBRUARY_2026',
      'SEASON_2026',
    ]);
  });

  it('calculates outward seasonal rent breakdown matching confirmed rates', () => {
    const res = calculateOutwardSeasonalBreakdown({
      inwardDate: '2024-07-10',
      deliveryDate: '2026-10-11',
      smallBags: 50,
      bigBags: 50,
      seasonalRates: { small: 150, big: 210 },
      monthlyRates: { small: 15, big: 21 },
    });

    // 3 seasons @ 18,000 = 54,000
    // 4 monthly @ 1,800 = 7,200
    // Total = 61,200
    expect(res.totalRent).toBe(61200);
    expect(res.periods).toHaveLength(7);
    expect(res.periods[0].amount).toBe(18000);
    expect(res.periods[1].amount).toBe(1800);
    expect(res.periods[2].amount).toBe(1800);
    expect(res.periods[3].amount).toBe(18000);
  });

  describe('deriveModernRateVisibility', () => {
    it('Scenario A: Seasonal Rent, Inward earlier year, Outward later year -> shows both Seasonal and Monthly rate', () => {
      const vis = deriveModernRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2023-04-15',
        deliveryDate: '2026-10-11',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(true);
    });

    it('Scenario B: Seasonal Rent, Inward and Outward same year (within Mar-Dec) -> shows only Seasonal rate', () => {
      const vis = deriveModernRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2026-03-20',
        deliveryDate: '2026-11-15',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(false);
    });

    it('Scenario B.1: Seasonal Rent, crossing Dec 31 into January extension -> shows both Seasonal and Monthly rate', () => {
      const vis = deriveModernRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2026-03-20',
        deliveryDate: '2027-01-10',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(true);
    });

    it('Scenario C: Monthly Rent selected during inward entry -> shows only Monthly rate regardless of year', () => {
      const visSameYear = deriveModernRateVisibility({
        rentType: 'Monthly',
        inwardDate: '2026-03-20',
        deliveryDate: '2026-11-15',
      });
      expect(visSameYear.showSeasonalRate).toBe(false);
      expect(visSameYear.showMonthlyRate).toBe(true);

      const visMultiYear = deriveModernRateVisibility({
        rentType: 'Monthly',
        inwardDate: '2023-04-15',
        deliveryDate: '2026-10-11',
      });
      expect(visMultiYear.showSeasonalRate).toBe(false);
      expect(visMultiYear.showMonthlyRate).toBe(true);
    });
  });
});
