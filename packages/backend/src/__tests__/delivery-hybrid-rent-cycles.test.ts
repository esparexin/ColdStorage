import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-hybrid-rent-cycles';

describe('Outward Delivery Monthly Rent - Hybrid & S/B Cycles', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  }, 30000);

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Hybrid Cycles Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Fresh Produce Traders' });
    await CommodityModel.create({
      id: 'cmd-onions-hybrid',
      name: 'Onions',
      normalizedName: 'onions',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('calculates Monthly rent correctly for Hybrid bag type with explicit monthly rate', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() - 2, deliveryDate.getDate() - 1);

    const grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions-hybrid',
      commodityName: 'Onions',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S+B',
      bagCategory: 'Hybrid',
      smallBags: 60,
      bigBags: 40,
      rentType: 'Monthly',
      date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: deliveryDate,
        smallBags: 30,
        bigBags: 20,
        bagCategory: 'Hybrid',
        monthlyBagPrice: 15,
      },
      USER_ID,
    );

    // 50 bags × ₹15/bag/mo × 3 cycles = ₹2,250
    expect(del.delivery.rentCharge).toBe(2250);
    expect(del.summary.remainingDeliveryBalance).toBe(50);
  });

  it('calculates Monthly rent correctly for S/B with differential rates', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(deliveryDate.getTime() - 24 * 60 * 60 * 1000);

    const grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions-hybrid',
      commodityName: 'Onions',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S+B',
      smallBags: 50,
      bigBags: 50,
      smallBagPrice: 10,
      bigBagPrice: 15,
      rentType: 'Monthly',
      date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: deliveryDate,
        smallBags: 30,
        bigBags: 20,
        bagCategory: 'Small & Big',
      },
      USER_ID,
    );

    // (30 Small × ₹10 + 20 Big × ₹15) × 1 month = (300 + 300) × 1 = ₹600
    expect(del.delivery.rentCharge).toBe(600);
    expect(del.summary.remainingDeliveryBalance).toBe(50);
  });
});
