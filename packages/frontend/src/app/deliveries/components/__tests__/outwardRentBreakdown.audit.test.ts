import { describe, expect, it } from 'vitest';
import { calculateOutwardSeasonalBreakdown, toExcludedPeriodKeys } from '@cold-storage/contracts';
import { formatSeasonalBreakdownRows } from '../outwardRentBreakdown.helper';
import { computeOutwardRentCharge } from '../../hooks/deliveryRent.helper';

describe('Outward Rent Breakdown - Audit Reproduction Cases', () => {
  it('audit reproduction case: verifies 10 Small + 8 Big differential rates across 3 seasons and 2 extensions', () => {
    // 10 Small @ 110 Seasonal / 30 Monthly
    // 8 Big @ 185 Seasonal / 40 Monthly
    // Hamali: 18 bags @ 25 = 450
    const periods = [
      { periodKey: 'SEASON_2024', label: 'Season 2024', periodType: 'SEASON' as const, smallBags: 10, bigBags: 8, smallRate: 110, bigRate: 185, amount: 2580 },
      { periodKey: 'JANUARY_2025', label: 'January 2025', periodType: 'JANUARY' as const, smallBags: 10, bigBags: 8, smallRate: 30, bigRate: 40, amount: 620 },
      { periodKey: 'FEBRUARY_2025', label: 'February 2025', periodType: 'FEBRUARY' as const, smallBags: 10, bigBags: 8, smallRate: 30, bigRate: 40, amount: 620 },
      { periodKey: 'SEASON_2025', label: 'Season 2025', periodType: 'SEASON' as const, smallBags: 10, bigBags: 8, smallRate: 110, bigRate: 185, amount: 2580 },
      { periodKey: 'JANUARY_2026', label: 'January 2026', periodType: 'JANUARY' as const, smallBags: 10, bigBags: 8, smallRate: 30, bigRate: 40, amount: 620 },
      { periodKey: 'FEBRUARY_2026', label: 'February 2026', periodType: 'FEBRUARY' as const, smallBags: 10, bigBags: 8, smallRate: 30, bigRate: 40, amount: 620 },
      { periodKey: 'SEASON_2026', label: 'Season 2026', periodType: 'SEASON' as const, smallBags: 10, bigBags: 8, smallRate: 110, bigRate: 185, amount: 2580 },
    ];

    const rows = formatSeasonalBreakdownRows({
      periods,
      isHybrid: false,
      totalWithdrawing: 18,
      hamaliRate: 25,
    });

    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      id: 'SEASON_2024',
      title: '(2024) Mar - Dec',
      periodMeta: '',
      details: '10 Small × ₹110 (₹1,100) + 8 Big × ₹185 (₹1,480)',
      amount: 2580,
    });
    expect(rows[1]).toEqual({
      id: 'JANUARY_2025_FEBRUARY_2025',
      title: '(2025) Jan - Feb',
      periodMeta: '',
      details: '10 Small × ₹60.00 (₹600) + 8 Big × ₹80.00 (₹640) (2 months)',
      amount: 1240,
    });
    expect(rows[2]).toEqual({
      id: 'SEASON_2025',
      title: '(2025) Mar - Dec',
      periodMeta: '',
      details: '10 Small × ₹110 (₹1,100) + 8 Big × ₹185 (₹1,480)',
      amount: 2580,
    });
    expect(rows[3]).toEqual({
      id: 'JANUARY_2026_FEBRUARY_2026',
      title: '(2026) Jan - Feb',
      periodMeta: '',
      details: '10 Small × ₹60.00 (₹600) + 8 Big × ₹80.00 (₹640) (2 months)',
      amount: 1240,
    });
    expect(rows[4]).toEqual({
      id: 'SEASON_2026',
      title: '(2026) Mar - Dec',
      periodMeta: '',
      details: '10 Small × ₹110 (₹1,100) + 8 Big × ₹185 (₹1,480)',
      amount: 2580,
    });
    expect(rows[5]).toEqual({
      id: 'hamali-charges',
      title: 'Hamali Charges',
      periodMeta: '',
      details: '18 bags × ₹25.00 / bag',
      amount: 450,
    });

    // Storage rent rows must equal 7,740 (3 seasons) + 2,480 (4 months) = 10,220
    const storageRentTotal = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
    expect(storageRentTotal).toBe(10220);

    // Total payable must equal 10,220 + 450 = 10,670
    const totalPayable = rows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPayable).toBe(10670);
  });

  it('calculates audit scenario (10 Small + 8 Big) multi-year seasonal rent exactly to ₹10,220', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal',
      bagCategory: 'S/B',
      smallBags: 10,
      bigBags: 8,
      smallBagPrice: 110,
      bigBagPrice: 185,
      monthlySmallBagPrice: 30,
      monthlyBigBagPrice: 40,
      inwardDate: '2024-04-12',
      deliveryDate: '2026-10-31',
    });
    // 3 seasons @ (10*110 + 8*185 = 2,580) = 7,740
    // 4 extension months (Jan 25, Feb 25, Jan 26, Feb 26) @ (10*30 + 8*40 = 620) = 2,480
    // Total = 7,740 + 2,480 = 10,220
    expect(rent).toBe(10220);
  });

  it('deduplicates finalized extensions via excludePeriodKeys in both charge computation and breakdown rows', () => {
    // If January and February 2025 were already finalized as extensions:
    const extensions = [
      { seasonYear: 2024, period: 'JANUARY' as const },
      { seasonYear: 2024, period: 'FEBRUARY' as const },
    ];
    const excludePeriodKeys = toExcludedPeriodKeys(extensions);
    expect(excludePeriodKeys).toEqual(['JANUARY_2025', 'FEBRUARY_2025']);

    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal',
      bagCategory: 'S/B',
      smallBags: 10,
      bigBags: 8,
      smallBagPrice: 110,
      bigBagPrice: 185,
      monthlySmallBagPrice: 30,
      monthlyBigBagPrice: 40,
      inwardDate: '2024-04-12',
      deliveryDate: '2026-10-31',
      excludePeriodKeys,
    });
    // 3 seasons @ 2,580 = 7,740
    // 2 extension months in 2026 @ 620 = 1,240 (Jan & Feb 2025 skipped!)
    // Total Storage Rent = 7,740 + 1,240 = 8,980
    expect(rent).toBe(8980);

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: '2024-04-12',
      deliveryDate: '2026-10-31',
      smallBags: 10,
      bigBags: 8,
      seasonalRates: { small: 110, big: 185 },
      monthlyRates: { small: 30, big: 40 },
      excludePeriodKeys,
    });
    expect(breakdown.totalRent).toBe(8980);
    expect(breakdown.periods).toHaveLength(5); // 3 seasons + Jan 2026 + Feb 2026

    const rows = formatSeasonalBreakdownRows({
      periods: breakdown.periods,
      isHybrid: false,
      totalWithdrawing: 18,
      hamaliRate: 25,
    });

    const storageSum = rows.filter((r) => r.id !== 'hamali-charges').reduce((sum, r) => sum + r.amount, 0);
    expect(storageSum).toBe(8980);

    const totalPayable = rows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPayable).toBe(8980 + 450); // 9,430
  });
});
