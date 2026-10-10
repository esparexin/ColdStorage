import { describe, expect, it } from 'vitest';
import {
  calculatePeriodRent,
  commodityRateQuerySchema,
  commodityRateSchema,
  pickRateForBags,
  resolvePeriodEffectiveRate,
  upsertCommodityRateSchema,
} from '../index.js';

describe('Price Controller commodity rates', () => {
  it('accepts distinct seasonal and monthly rates for one commodity', () => {
    const seasonal = upsertCommodityRateSchema.parse({
      commodityId: 'cmd-potato',
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
    });
    expect(seasonal.smallRate).toBe(12);

    const monthly = upsertCommodityRateSchema.parse({
      commodityId: 'cmd-potato',
      rentType: 'Monthly',
      smallRate: 12,
      bigRate: 18,
    });
    expect(monthly.rentType).toBe('Monthly');
  });

  it('rejects non-positive, excessive, or non-numeric rates', () => {
    const base = { commodityId: 'cmd-1', rentType: 'Seasonal' as const, bigRate: 15 };
    expect(() => upsertCommodityRateSchema.parse({ ...base, smallRate: 0 })).toThrow();
    expect(() => upsertCommodityRateSchema.parse({ ...base, smallRate: -5 })).toThrow();
    expect(() => upsertCommodityRateSchema.parse({ ...base, smallRate: 100001 })).toThrow();
    expect(() =>
      upsertCommodityRateSchema.parse({ ...base, smallRate: 'abc' }),
    ).toThrow();
    expect(() =>
      upsertCommodityRateSchema.parse({ ...base, rentType: 'Yearly' }),
    ).toThrow();
    expect(() =>
      upsertCommodityRateSchema.parse({ ...base, smallRate: 10, commodityId: '' }),
    ).toThrow();
  });

  it('parses stored rate rows and picks the small/big pair', () => {
    const row = commodityRateSchema.parse({
      id: 'crt-1',
      commodityId: 'cmd-1',
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 15,
      isActive: true,
    });
    expect(pickRateForBags(row)).toEqual({ small: 10, big: 15 });
  });

  it('charges seasonal renewals as whole-season totals and Jan/Feb as one month', () => {
    // SEASON: 100 bags × ₹12 whole-season total = ₹1,200 (never × months)
    expect(
      calculatePeriodRent({
        period: 'SEASON',
        bagType: 'S',
        snapshotSmallBags: 100,
        snapshotBigBags: 0,
        smallRate: 12,
        bigRate: 18,
      }),
    ).toBe(1200);
    // JANUARY: 100 bags × ₹12 × 1 month = ₹1,200
    expect(
      calculatePeriodRent({
        period: 'JANUARY',
        bagType: 'S',
        snapshotSmallBags: 100,
        snapshotBigBags: 0,
        smallRate: 12,
        bigRate: 18,
      }),
    ).toBe(1200);
    // S+B split preserved: 60 × 10 + 40 × 15 = ₹1,200 either period kind
    for (const period of ['SEASON', 'FEBRUARY'] as const) {
      expect(
        calculatePeriodRent({
          period,
          bagType: 'S+B',
          snapshotSmallBags: 60,
          snapshotBigBags: 40,
          smallRate: 10,
          bigRate: 15,
        }),
      ).toBe(1200);
    }
  });

  it('derives the effective per-bag rate alongside the period charge', () => {
    expect(
      resolvePeriodEffectiveRate({
        period: 'JANUARY',
        bagType: 'S',
        snapshotSmallBags: 100,
        snapshotBigBags: 0,
        smallRate: 12,
        bigRate: 18,
      }),
    ).toEqual({ calculatedAmount: 1200, bagRate: 12 });
    // S+B split: weighted average across the snapshot
    expect(
      resolvePeriodEffectiveRate({
        period: 'SEASON',
        bagType: 'S+B',
        snapshotSmallBags: 60,
        snapshotBigBags: 40,
        smallRate: 10,
        bigRate: 15,
      }),
    ).toEqual({ calculatedAmount: 1200, bagRate: 12 });
    expect(
      resolvePeriodEffectiveRate({
        period: 'SEASON',
        bagType: 'S',
        snapshotSmallBags: 0,
        snapshotBigBags: 0,
        smallRate: 12,
        bigRate: 18,
      }),
    ).toEqual({ calculatedAmount: 0, bagRate: 0 });
  });

  it('validates rate lookup queries', () => {
    expect(
      commodityRateQuerySchema.safeParse({ commodityId: 'cmd-1', rentType: 'Seasonal' })
        .success,
    ).toBe(true);
    expect(
      commodityRateQuerySchema.safeParse({ commodityId: '', rentType: 'Seasonal' }).success,
    ).toBe(false);
  });
});
