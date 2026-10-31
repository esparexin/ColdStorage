import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';
import { grnService } from '../modules/grn/grn.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('grn-movement-history unclassified bag composition', () => {
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;
  let facilityId: string;
  let customerId: string;
  const userId = 'user-mvhist-unclass';

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
    await resetStockCollections();
    await CommodityModel.findOneAndUpdate(
      { id: 'cmd-mvhist' },
      { $set: { name: 'Test Commodity', normalizedName: 'test commodity', isActive: true } },
      { upsert: true, new: true },
    ).exec();
    await CommodityRateModel.deleteMany({ commodityId: 'cmd-mvhist' }).exec();
    await CommodityRateModel.create([
      { id: 'crt-cmdmvhist-s2', commodityId: 'cmd-mvhist', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true },
    ]);
    facilityId = await seedFacility({ name: 'Unclass Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Unclass Customer' });
  });

  afterAll(async () => {
    if (originalEnv !== undefined) process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    else delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    await disconnectTestDatabase();
  });

  it('preserves unclassified inward stock without assigning Small bags for 10 bags inward (GRN 0023 reproduction)', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '0023',
        date: new Date('2024-03-20'),
        customerId,
        commodityId: 'cmd-mvhist',
        chamber: 'A-01,09',
        bags: 10,
        rentType: 'Seasonal',
      } as never,
      userId,
    );

    const history = await getGrnMovementHistory(facilityId, grn.id);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(10);
    expect(history!.netDeliveredBags).toBe(0);
    expect(history!.currentClosingBags).toBe(10);
    expect(history!.originalSmallBags).toBeUndefined();
    expect(history!.originalBigBags).toBeUndefined();
    expect(history!.currentClosingSmallBags).toBeUndefined();
    expect(history!.currentClosingBigBags).toBeUndefined();

    const inwardEntry = history!.entries[0];
    expect(inwardEntry.type).toBe('INWARD');
    expect(inwardEntry.openingBags).toBe(0);
    expect(inwardEntry.deliveredBags).toBe(0);
    expect(inwardEntry.closingBags).toBe(10);
    expect(inwardEntry.smallBags).toBeNull();
    expect(inwardEntry.bigBags).toBeNull();
    expect(inwardEntry.remainingSmallBags).toBeNull();
    expect(inwardEntry.remainingBigBags).toBeNull();
  });

  it('preserves unclassified inward stock without assigning Small bags for different total quantities (250 bags)', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '0250',
        date: new Date('2024-03-20'),
        customerId,
        commodityId: 'cmd-mvhist',
        chamber: 'CH-01',
        bags: 250,
        rentType: 'Seasonal',
      } as never,
      userId,
    );

    const history = await getGrnMovementHistory(facilityId, grn.id);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(250);
    expect(history!.currentClosingBags).toBe(250);
    expect(history!.entries[0].smallBags).toBeNull();
    expect(history!.entries[0].bigBags).toBeNull();
    expect(history!.entries[0].remainingSmallBags).toBeNull();
    expect(history!.entries[0].remainingBigBags).toBeNull();
  });

  it('accurately maintains verified bag composition when explicitly provided at inward', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1005',
        date: new Date('2024-03-20'),
        customerId,
        commodityId: 'cmd-mvhist',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBags: 60,
        bigBags: 40,
        rentType: 'Seasonal',
      } as never,
      userId,
    );

    const history = await getGrnMovementHistory(facilityId, grn.id);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(100);
    expect(history!.originalSmallBags).toBe(60);
    expect(history!.originalBigBags).toBe(40);
    expect(history!.currentClosingSmallBags).toBe(60);
    expect(history!.currentClosingBigBags).toBe(40);
    expect(history!.entries[0].smallBags).toBe(60);
    expect(history!.entries[0].bigBags).toBe(40);
    expect(history!.entries[0].remainingSmallBags).toBe(60);
    expect(history!.entries[0].remainingBigBags).toBe(40);
  });
});
