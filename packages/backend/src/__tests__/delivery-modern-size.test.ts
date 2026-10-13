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

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

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
    expect(result.delivery.totalBags).toBe(50);

    expect(result.summary.remainingDeliveryBalance).toBe(50);
    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.smallBags).toBe(0);
    expect(balance.bigBags).toBe(50);
    expect(balance.total).toBe(50);
  });

  it('delivers canonical Hybrid bags with single total count without artificial S/B split', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'HYB-104',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S+B',
        smallBags: 40,
        bigBags: 60,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    const result = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        quantity: 50,
        bagCategory: 'Hybrid',
        bagPrice: 50,
      },
      USER_ID,
    );

    expect(result.delivery.rentCharge).toBe(2500);
    expect(result.delivery.bagCategory).toBe('Hybrid');
    expect(result.delivery.totalBags).toBe(50);

    const challanDoc = await DeliveryChallanModel.findOne({ id: result.delivery.id }).lean();
    expect(challanDoc?.bagCategory).toBe('Hybrid');
    expect((challanDoc?.smallBags ?? 0) + (challanDoc?.bigBags ?? 0)).toBe(50);

    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.total).toBe(50);
  });

  it('correctly calculates and persists Modern outward delivery with separate seasonal and monthly rates', async () => {
    // Multi-year seasonal storage (2024-07-10 to 2026-10-15)
    // 3 seasons (2024, 2025, 2026) + 4 monthly extensions (Jan 2025, Feb 2025, Jan 2026, Feb 2026)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'MOD-103',
        date: new Date('2024-07-10'),
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
        date: new Date('2026-10-10'),
        quantity: 20,
        bagCategory: 'Modern',
        seasonalBagPrice: 100,
        monthlyBagPrice: 10,
      },
      USER_ID,
    );

    // 20 bags:
    // 3 seasons × (20 bags × ₹100) = ₹6,000
    // 4 extensions × (20 bags × ₹10) = ₹800
    // Total = ₹6,800
    expect(result.delivery.rentCharge).toBe(6800);
    expect(result.delivery.bagCategory).toBe('Modern');
    expect(result.delivery.seasonalBagPrice).toBe(100);
    expect(result.delivery.monthlyBagPrice).toBe(10);
    expect(result.delivery.totalBags).toBe(20);

    const challanDoc = await DeliveryChallanModel.findOne({ id: result.delivery.id }).lean();
    expect(challanDoc?.bagCategory).toBe('Modern');
    expect(challanDoc?.seasonalBagPrice).toBe(100);
    expect(challanDoc?.monthlyBagPrice).toBe(10);
  });
});

