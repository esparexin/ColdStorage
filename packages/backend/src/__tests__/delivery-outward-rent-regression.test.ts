import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-outward-rent-regression';

describe('Outward Rent Regression: screenshot 50k vs 48k + mismatch guard', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-wheat-s', commodityId: 'cmd-wheat', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-wheat-m', commodityId: 'cmd-wheat', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    facilityId = await seedFacility({ name: 'Outward Regression Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Agro Farms Ltd' });
    await CommodityModel.create({
      id: 'cmd-wheat',
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  async function createGrn(grnNumber: string, extra: Record<string, unknown> = {}) {
    return grnService.createGrn(
      facilityId,
      {
        grnNumber,
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 400,
        bagType: 'S+B',
        smallBags: 200,
        bigBags: 200,
        rentType: 'Seasonal',
        smallBagPrice: 10,
        bigBagPrice: 15,
        rentAmount: 0,
        ...extra,
      } as never,
      USER_ID,
    );
  }

  it('rejects mismatched rentCharge instead of trusting the client', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '9001',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        smallBagPrice: 10,
        rentAmount: 0,
      },
      USER_ID,
    );
    await expect(
      deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 20, bigBags: 0, rentCharge: 1200 }, USER_ID),
    ).rejects.toThrow(/rentCharge mismatch/);
  });

  it('screenshot: 200 Small + 200 Big canonical = Rs 5,000 season total', async () => {
    const { grn } = await createGrn('9002');
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 200, bigBags: 200, bagCategory: 'Small & Big' },
      USER_ID,
    );
    expect(del.delivery.rentCharge).toBe(5000);
  });

  it('screenshot divergence: uniform Rs 12 agreed rate = Rs 4,800 season total', async () => {
    await CommodityRateModel.updateOne({ id: 'crt-cmd-wheat-s' }, { $set: { smallRate: 12, bigRate: 12 } });
    const { grn } = await createGrn('9003', { smallBagPrice: 12, bigBagPrice: 12 });
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 200, bigBags: 200, bagCategory: 'Small & Big' },
      USER_ID,
    );
    expect(del.delivery.rentCharge).toBe(4800);
  });
});
