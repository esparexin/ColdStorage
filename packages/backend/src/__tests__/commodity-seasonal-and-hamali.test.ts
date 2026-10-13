import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { commodityService } from '../modules/commodities/commodity.service.js';
import { commodityRateService } from '../modules/commodities/commodity-rate.service.js';

describe('Commodity Master Data — 3M Seasonal & Hamali', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
  });

  it('creates commodity with 3-Month seasonal duration and hamali rate', async () => {
    const created = await commodityService.createCommodity({
      name: 'Kufri Jyoti 3M',
      seasonDuration: 'Seasonal_3M',
      hamaliRate: 5.5,
    });

    expect(created.seasonDuration).toBe('Seasonal_3M');
    expect(created.hamaliRate).toBe(5.5);

    const fetched = await commodityService.getCommodityById(created.id);
    expect(fetched?.seasonDuration).toBe('Seasonal_3M');
    expect(fetched?.hamaliRate).toBe(5.5);
  });

  it('defaults seasonDuration to Seasonal and hamaliRate to 0 when omitted', async () => {
    const created = await commodityService.createCommodity({
      name: 'Standard Potato',
    });

    expect(created.seasonDuration).toBe('Seasonal');
    expect(created.hamaliRate).toBe(0);
  });

  it('updates commodity seasonDuration and hamaliRate', async () => {
    const created = await commodityService.createCommodity({
      name: 'Pukhraj',
      seasonDuration: 'Seasonal',
      hamaliRate: 0,
    });

    const updated = await commodityService.updateCommodity(created.id, {
      seasonDuration: 'Seasonal_3M',
      isHamaliApplicable: true,
      hamaliRate: 6,
    });

    expect(updated?.seasonDuration).toBe('Seasonal_3M');
    expect(updated?.isHamaliApplicable).toBe(true);
    expect(updated?.hamaliRate).toBe(6);
  });

  it('resets hamaliRate to 0 when isHamaliApplicable is toggled off', async () => {
    const created = await commodityService.createCommodity({
      name: 'Lady Rosetta',
      isHamaliApplicable: true,
      hamaliRate: 5,
    });

    expect(created.isHamaliApplicable).toBe(true);
    expect(created.hamaliRate).toBe(5);

    const updated = await commodityService.updateCommodity(created.id, {
      isHamaliApplicable: false,
    });

    expect(updated?.isHamaliApplicable).toBe(false);
    expect(updated?.hamaliRate).toBe(0);
  });

  it('persists and returns hamaliRate on commodityRateService upsert', async () => {
    const cmd = await commodityService.createCommodity({ name: 'Sugar Free' });
    const rate = await commodityRateService.upsertRate({
      commodityId: cmd.id,
      rentType: 'Seasonal',
      smallRate: 15,
      bigRate: 20,
      hamaliRate: 4.5,
    });

    expect(rate.hamaliRate).toBe(4.5);

    const active = await commodityRateService.getRate(cmd.id, 'Seasonal');
    expect(active?.hamaliRate).toBe(4.5);
  });
});
