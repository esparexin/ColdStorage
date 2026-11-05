import { describe, expect, it } from 'vitest';
import { calculateOutwardSeasonalBreakdown } from '@cold-storage/contracts';
import { formatSeasonalBreakdownRows } from '../outwardRentBreakdown.helper';

describe('Consumer 4: Gate Pass-Based Rent Billing Breakdown (GRN #0007 Scenario)', () => {
  it('produces independent breakdown rows for CHL-26-27-0004 (70 bags: ₹11,950) and CHL-26-27-0005 (20 bags: ₹3,300)', () => {
    const inwardDate = '2026-03-15';
    const rates = { small: 125, big: 205 };

    // Delivery 1: CHL-26-27-0004 (70 bags: 30S, 40B)
    const bd1 = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate: '2026-11-03',
      smallBags: 30,
      bigBags: 40,
      seasonalRates: rates,
      monthlyRates: rates,
    });
    expect(bd1.totalRent).toBe(11950);

    const rows1 = formatSeasonalBreakdownRows({
      periods: bd1.periods,
      isHybrid: false,
      totalWithdrawing: 70,
    });
    expect(rows1).toHaveLength(1);
    expect(rows1[0].title).toBe('(2026) Mar - Dec');
    expect(rows1[0].details).toBe('30 Small × ₹125 (₹3,750) + 40 Big × ₹205 (₹8,200)');
    expect(rows1[0].amount).toBe(11950);

    // Delivery 2: CHL-26-27-0005 (20 bags: 10S, 10B)
    const bd2 = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate: '2026-11-04',
      smallBags: 10,
      bigBags: 10,
      seasonalRates: rates,
      monthlyRates: rates,
    });
    expect(bd2.totalRent).toBe(3300);

    const rows2 = formatSeasonalBreakdownRows({
      periods: bd2.periods,
      isHybrid: false,
      totalWithdrawing: 20,
    });
    expect(rows2).toHaveLength(1);
    expect(rows2[0].title).toBe('(2026) Mar - Dec');
    expect(rows2[0].details).toBe('10 Small × ₹125 (₹1,250) + 10 Big × ₹205 (₹2,050)');
    expect(rows2[0].amount).toBe(3300);

    // Sum equals ₹15,250
    expect(bd1.totalRent + bd2.totalRent).toBe(15250);
  });

  it('produces itemized storage rent and hamali charges when hamali is configured', () => {
    const inwardDate = '2026-03-15';
    const rates = { small: 125, big: 205 };
    const hamaliRate = 25;

    // Delivery 1: CHL-26-27-0004 (70 bags: 30S, 40B)
    const bd1 = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate: '2026-11-03',
      smallBags: 30,
      bigBags: 40,
      seasonalRates: rates,
      monthlyRates: rates,
      hamaliRate,
    });
    // Storage rent is net of hamali: 30 * 100 + 40 * 180 = 10,200
    expect(bd1.storageRent).toBe(10200);
    expect(bd1.hamaliAmount).toBe(1750);
    expect(bd1.totalAmount).toBe(11950);

    const rows1 = formatSeasonalBreakdownRows({
      periods: bd1.periods,
      isHybrid: false,
      totalWithdrawing: 70,
      hamaliRate,
    });
    expect(rows1).toHaveLength(2);
    expect(rows1[0].title).toBe('(2026) Mar - Dec');
    expect(rows1[0].details).toBe('30 Small × ₹100 (₹3,000) + 40 Big × ₹180 (₹7,200)');
    expect(rows1[0].amount).toBe(10200);
    expect(rows1[1].title).toBe('Hamali Charges');
    expect(rows1[1].details).toBe('70 bags × ₹25.00 / bag');
    expect(rows1[1].amount).toBe(1750);

    // Delivery 2: CHL-26-27-0005 (20 bags: 10S, 10B)
    const bd2 = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate: '2026-11-04',
      smallBags: 10,
      bigBags: 10,
      seasonalRates: rates,
      monthlyRates: rates,
      hamaliRate,
    });
    // Storage rent is net of hamali: 10 * 100 + 10 * 180 = 2,800
    expect(bd2.storageRent).toBe(2800);
    expect(bd2.hamaliAmount).toBe(500);
    expect(bd2.totalAmount).toBe(3300);

    const rows2 = formatSeasonalBreakdownRows({
      periods: bd2.periods,
      isHybrid: false,
      totalWithdrawing: 20,
      hamaliRate,
    });
    expect(rows2).toHaveLength(2);
    expect(rows2[0].title).toBe('(2026) Mar - Dec');
    expect(rows2[0].details).toBe('10 Small × ₹100 (₹1,000) + 10 Big × ₹180 (₹1,800)');
    expect(rows2[0].amount).toBe(2800);
    expect(rows2[1].title).toBe('Hamali Charges');
    expect(rows2[1].details).toBe('20 bags × ₹25.00 / bag');
    expect(rows2[1].amount).toBe(500);

    // Sum equals ₹15,250
    expect(bd1.totalAmount + bd2.totalAmount).toBe(15250);
  });

  it('combines January and February post-season extensions into a 2-month row', () => {
    const inwardDate = '2025-04-10';
    const deliveryDate = '2026-02-15'; // withdrawn in February extension
    const rates = { small: 100, big: 160 };

    const bd = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: 10,
      bigBags: 20,
      seasonalRates: rates,
      monthlyRates: { small: 20, big: 30 },
    });

    const rows = formatSeasonalBreakdownRows({
      periods: bd.periods,
      isHybrid: false,
      totalWithdrawing: 30,
    });

    // Season 2025 + Combined Jan-Feb 2026
    const combinedRow = rows.find((r) => r.title.includes('Jan - Feb'));
    expect(combinedRow).toBeDefined();
    expect(combinedRow?.title).toBe('Jan - Feb');
    expect(combinedRow?.details).toContain('(2 months)');
  });
});

