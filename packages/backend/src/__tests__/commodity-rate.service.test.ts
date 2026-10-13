import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { commodityRateService } from '../modules/commodities/commodity-rate.service.js';

/**
 * Price Controller: one authoritative rate row per (commodity, rent type).
 * Seasonal and monthly rows are independent; history is never repriced.
 */
describe('Commodity rates — commodity-rate.service.test.ts', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await CommodityModel.create({
      id: 'cmd-rate-1',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti',
      isActive: true,
    });
  });

  it('upserts and resolves distinct seasonal and monthly rates', async () => {
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
    });
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 15,
    });

    const seasonal = await commodityRateService.getRate('cmd-rate-1', 'Seasonal');
    const monthly = await commodityRateService.getRate('cmd-rate-1', 'Monthly');
    expect(seasonal).toMatchObject({ smallRate: 12, bigRate: 18, isActive: true });
    expect(monthly).toMatchObject({ smallRate: 10, bigRate: 15, isActive: true });
  });

  it('replaces the same pair without touching the other rent type', async () => {
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
    });
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 15,
    });
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Seasonal',
      smallRate: 14,
      bigRate: 20,
    });

    const rows = await commodityRateService.listRates('cmd-rate-1');
    expect(rows).toHaveLength(2);
    expect(await commodityRateService.getRate('cmd-rate-1', 'Seasonal')).toMatchObject({
      smallRate: 14,
      bigRate: 20,
    });
    expect(await commodityRateService.getRate('cmd-rate-1', 'Monthly')).toMatchObject({
      smallRate: 10,
      bigRate: 15,
    });
  });

  it('rejects rates for unknown commodities', async () => {
    await expect(
      commodityRateService.upsertRate({
        commodityId: 'cmd-missing',
        rentType: 'Seasonal',
        smallRate: 12,
        bigRate: 18,
      }),
    ).rejects.toThrow(`Commodity 'cmd-missing' not found`);
  });

  it('hides inactive rows from resolution but keeps them listed', async () => {
    await commodityRateService.upsertRate({
      commodityId: 'cmd-rate-1',
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: false,
    });

    expect(await commodityRateService.getRate('cmd-rate-1', 'Seasonal')).toBeNull();
    expect(await commodityRateService.listRates('cmd-rate-1')).toHaveLength(1);
  });

  it('returns null lookups for unconfigured pairs (legacy path)', async () => {
    expect(await commodityRateService.getRate('cmd-rate-1', 'Monthly')).toBeNull();
  });

  describe('rent-vs-hamali policy (F1)', () => {
    beforeEach(async () => {
      await CommodityModel.updateOne(
        { id: 'cmd-rate-1' },
        { $set: { isHamaliApplicable: true, hamaliRate: 20 } },
      );
    });

    it('rejects rates at or below the Hamali rate when Hamali is enabled', async () => {
      await expect(
        commodityRateService.upsertRate({ commodityId: 'cmd-rate-1', rentType: 'Seasonal', smallRate: 20, bigRate: 30 }),
      ).rejects.toThrow('must exceed the Hamali rate of ₹20/bag');
      await expect(
        commodityRateService.upsertRate({ commodityId: 'cmd-rate-1', rentType: 'Monthly', smallRate: 30, bigRate: 5 }),
      ).rejects.toThrow('must exceed the Hamali rate of ₹20/bag');
    });

    it('accepts rates above the Hamali rate', async () => {
      const rate = await commodityRateService.upsertRate({
        commodityId: 'cmd-rate-1', rentType: 'Seasonal', smallRate: 21, bigRate: 30,
      });
      expect(rate).toMatchObject({ smallRate: 21, bigRate: 30 });
    });

    it('skips the policy when Hamali is disabled, even with a stale rate value', async () => {
      await CommodityModel.updateOne(
        { id: 'cmd-rate-1' },
        { $set: { isHamaliApplicable: false, hamaliRate: 0 } },
      );
      const rate = await commodityRateService.upsertRate({
        commodityId: 'cmd-rate-1', rentType: 'Seasonal', smallRate: 5, bigRate: 6,
      });
      expect(rate).toMatchObject({ smallRate: 5, bigRate: 6 });
    });
  });
});
