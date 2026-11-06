import { describe, expect, it } from 'vitest';
import {
  calculateOutwardSeasonalBreakdown,
  deriveHybridRateVisibility,
  resolveActiveSubscriptionPeriodKey,
  resolveMergeExcludedPeriodKeys,
  resolveTransferExcludedPeriodKeys,
} from '../seasonal-periods.js';

describe('merge-periods & active period SSOT contracts', () => {
  it('identifies active subscription period across season and extension months', () => {
    // March to December: main season
    expect(resolveActiveSubscriptionPeriodKey('2026-03-01')).toBe('SEASON_2026');
    expect(resolveActiveSubscriptionPeriodKey('2026-11-05')).toBe('SEASON_2026');
    expect(resolveActiveSubscriptionPeriodKey('2026-12-31')).toBe('SEASON_2026');

    // January: active Jan extension
    expect(resolveActiveSubscriptionPeriodKey('2026-01-15')).toBe('JANUARY_2026');

    // February: active Feb extension
    expect(resolveActiveSubscriptionPeriodKey('2026-02-15')).toBe('FEBRUARY_2026');
  });

  it('Scenario 1: Same season merge (both 2026) in Nov 2026 excludes active Season 2026', () => {
    const excluded = resolveMergeExcludedPeriodKeys({
      inwardDate: '2026-04-10',
      movementDate: '2026-11-05',
      targetGrnDate: '2026-04-01',
    });
    expect(excluded).toContain('SEASON_2026');

    // Zero completed periods prior to active Season 2026
    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2026-04-10',
      deliveryDate: '2026-11-05',
      smallBags: 20,
      bigBags: 30,
      seasonalRates: { small: 100, big: 180 },
      monthlyRates: { small: 45, big: 65 },
      excludePeriodKeys: excluded,
    });
    expect(breakdown.totalRent).toBe(0);
    expect(breakdown.periods).toHaveLength(0);
  });

  it('Scenario 2: Multi-year merge (2023 Source + 2024 Target in Nov 2026) includes completed up to Feb 2026 and excludes Season 2026', () => {
    const sourceExcluded = resolveMergeExcludedPeriodKeys({
      inwardDate: '2023-05-10',
      movementDate: '2026-11-05',
      targetGrnDate: '2024-06-15',
    });

    // Active Season 2026 is strictly excluded
    expect(sourceExcluded).toContain('SEASON_2026');

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2023-05-10',
      deliveryDate: '2026-11-05',
      smallBags: 10,
      bigBags: 20,
      seasonalRates: { small: 100, big: 180 },
      monthlyRates: { small: 45, big: 65 },
      excludePeriodKeys: sourceExcluded,
    });

    // Completed periods: Season 2023, Jan-Feb 2024, Season 2024, Jan-Feb 2025, Season 2025, Jan-Feb 2026
    expect(breakdown.periods.map((p) => p.periodKey)).toEqual([
      'SEASON_2023',
      'JANUARY_2024',
      'FEBRUARY_2024',
      'SEASON_2024',
      'JANUARY_2025',
      'FEBRUARY_2025',
      'SEASON_2025',
      'JANUARY_2026',
      'FEBRUARY_2026',
    ]);
    expect(breakdown.periods.find((p) => p.periodKey === 'SEASON_2026')).toBeUndefined();
  });

  it('Scenario 3: Merge during Jan 2026 excludes active January 2026 extension', () => {
    const excluded = resolveMergeExcludedPeriodKeys({
      inwardDate: '2024-06-15',
      movementDate: '2026-01-20',
      targetGrnDate: '2024-06-15',
    });

    expect(excluded).toContain('JANUARY_2026');

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2024-06-15',
      deliveryDate: '2026-01-20',
      smallBags: 10,
      bigBags: 10,
      seasonalRates: { small: 100, big: 100 },
      monthlyRates: { small: 50, big: 50 },
      excludePeriodKeys: excluded,
    });

    // Completed: Season 2024, Jan 2025, Feb 2025, Season 2025
    expect(breakdown.periods.map((p) => p.periodKey)).toEqual([
      'SEASON_2024',
      'JANUARY_2025',
      'FEBRUARY_2025',
      'SEASON_2025',
    ]);
    expect(breakdown.periods.find((p) => p.periodKey === 'JANUARY_2026')).toBeUndefined();
  });

  it('Scenario 4: Deduplicates previously billed extensions without double-charging', () => {
    const billedKeys = ['SEASON_2024', 'JANUARY_2025'];
    const excluded = resolveMergeExcludedPeriodKeys({
      inwardDate: '2024-06-15',
      movementDate: '2026-11-05',
      targetGrnDate: '2026-03-01',
      billedExtensionKeys: billedKeys,
    });

    expect(excluded).toContain('SEASON_2024');
    expect(excluded).toContain('JANUARY_2025');
    expect(excluded).toContain('SEASON_2026');

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2024-06-15',
      deliveryDate: '2026-11-05',
      smallBags: 10,
      bigBags: 0,
      seasonalRates: { small: 100, big: 100 },
      monthlyRates: { small: 50, big: 50 },
      excludePeriodKeys: excluded,
    });

    expect(breakdown.periods.map((p) => p.periodKey)).toEqual([
      'FEBRUARY_2025',
      'SEASON_2025',
      'JANUARY_2026',
      'FEBRUARY_2026',
    ]);
  });

  describe('deriveHybridRateVisibility', () => {
    it('Scenario A: Seasonal Rent, Inward earlier year, Outward later year -> shows both Seasonal and Monthly rate', () => {
      const vis = deriveHybridRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2023-04-15',
        deliveryDate: '2026-10-11',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(true);
    });

    it('Scenario B: Seasonal Rent, Inward and Outward same calendar year -> shows only Seasonal rate', () => {
      const vis = deriveHybridRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2026-04-10',
        deliveryDate: '2026-11-05',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(false);
    });

    it('Scenario B.1: Seasonal Rent, crossing Dec 31 into January extension -> shows both Seasonal and Monthly rate', () => {
      const vis = deriveHybridRateVisibility({
        rentType: 'Seasonal',
        inwardDate: '2026-03-20',
        deliveryDate: '2027-01-10',
      });
      expect(vis.showSeasonalRate).toBe(true);
      expect(vis.showMonthlyRate).toBe(true);
    });

    it('Scenario C: Monthly Rent -> shows only Monthly rate', () => {
      const vis = deriveHybridRateVisibility({
        rentType: 'Monthly',
        inwardDate: '2024-06-15',
        deliveryDate: '2026-11-05',
      });
      expect(vis.showSeasonalRate).toBe(false);
      expect(vis.showMonthlyRate).toBe(true);
    });
  });
});
