import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-modern-size-tester';

describe('Modern Size (Mixed Bag) Outward Delivery Flow', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Modern Size Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Kisan Traders' });
    await CommodityModel.create({
      id: 'cmd-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      defaultBagType: 'S+B',
    });
  });

  it('charges Modern Size outward delivery by quantity × manual bagPrice', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'MS-101',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S+B',
        smallBags: 50,
        bigBags: 50,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    const result = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        quantity: 40,
        bagCategory: 'Modern Size',
        bagPrice: 65,
      },
      USER_ID,
    );

    // 40 bags × ₹65.00 manual rate = ₹2,600.00
    expect(result.delivery.rentCharge).toBe(2600);
    expect(result.delivery.bagCategory).toBe('Modern Size');
    expect(result.delivery.bagPrice).toBe(65);
    expect(result.delivery.totalBags).toBe(40);

    const challanDoc = await DeliveryChallanModel.findOne({ id: result.delivery.id }).lean();
    expect(challanDoc?.bagCategory).toBe('Modern Size');
    expect(challanDoc?.bagPrice).toBe(65);

    expect(result.summary.remainingDeliveryBalance).toBe(60);
    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.total).toBe(60);
  });

  it('flexibly withdraws Modern Size bags across mixed Small & Big pool without type errors', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'MS-102',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S+B',
        smallBags: 30,
        bigBags: 70,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // Deliver 50 bags (exceeds 30 small bags, so draws 30 small and 20 big)
    const result = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        quantity: 50,
        bagCategory: 'Modern Size',
        bagPrice: 50,
      },
      USER_ID,
    );

    expect(result.delivery.rentCharge).toBe(2500);
    expect(result.delivery.smallBags).toBe(30);
    expect(result.delivery.bigBags).toBe(20);
    expect(result.delivery.totalBags).toBe(50);

    expect(result.summary.remainingDeliveryBalance).toBe(50);
    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.smallBags).toBe(0);
    expect(balance.bigBags).toBe(50);
    expect(balance.total).toBe(50);
  });
});
