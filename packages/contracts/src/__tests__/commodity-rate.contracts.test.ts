import { describe, expect, it } from 'vitest';
import {
  commodityRateQuerySchema,
  commodityRateSchema,
  pickRateForBags,
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
