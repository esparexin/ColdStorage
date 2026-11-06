import { describe, expect, it } from 'vitest';
import {
  calculateOutwardSeasonalBreakdown,
  resolveTransferExcludedPeriodKeys,
} from '../seasonal-periods.js';

describe('resolveTransferExcludedPeriodKeys (Ownership Transfer SSOT)', () => {
  it('Scenario 1: Same season transfer in Nov 2026 strictly excludes active Season 2026', () => {
    const excluded = resolveTransferExcludedPeriodKeys({
      inwardDate: '2026-04-10',
      movementDate: '2026-11-05',
    });
    expect(excluded).toContain('SEASON_2026');

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

  it('Scenario 2: Multi-year 2023 lot transferred in Nov 2026 includes completed up to Feb 2026 and excludes Season 2026', () => {
    const excluded = resolveTransferExcludedPeriodKeys({
      inwardDate: '2023-05-10',
      movementDate: '2026-11-05',
    });
    expect(excluded).toContain('SEASON_2026');

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2023-05-10',
      deliveryDate: '2026-11-05',
      smallBags: 10,
      bigBags: 20,
      seasonalRates: { small: 100, big: 180 },
      monthlyRates: { small: 45, big: 65 },
      excludePeriodKeys: excluded,
    });

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

  it('Scenario 3: Transfer in January 2026 excludes active January 2026 extension', () => {
    const excluded = resolveTransferExcludedPeriodKeys({
      inwardDate: '2024-06-15',
      movementDate: '2026-01-20',
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
    expect(breakdown.periods.map((p) => p.periodKey)).toEqual([
      'SEASON_2024',
      'JANUARY_2025',
      'FEBRUARY_2025',
      'SEASON_2025',
    ]);
  });

  it('Scenario 4: Transfer in February 2026 excludes active February 2026 extension', () => {
    const excluded = resolveTransferExcludedPeriodKeys({
      inwardDate: '2024-06-15',
      movementDate: '2026-02-15',
    });
    expect(excluded).toContain('FEBRUARY_2026');
    expect(excluded).not.toContain('JANUARY_2026');

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2024-06-15',
      deliveryDate: '2026-02-15',
      smallBags: 10,
      bigBags: 10,
      seasonalRates: { small: 100, big: 100 },
      monthlyRates: { small: 50, big: 50 },
      excludePeriodKeys: excluded,
    });
    expect(breakdown.periods.map((p) => p.periodKey)).toEqual([
      'SEASON_2024',
      'JANUARY_2025',
      'FEBRUARY_2025',
      'SEASON_2025',
      'JANUARY_2026',
    ]);
  });
});

