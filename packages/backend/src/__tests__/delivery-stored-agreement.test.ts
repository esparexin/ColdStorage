import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { commodityRateService } from '../modules/commodities/commodity-rate.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const FACILITY_ID = 'fac-stored-agree';
const USER_ID = 'usr-stored-agree';

/**
 * Phase 5 Outward semantics: delivery bills the stored immutable agreement,
 * never a live controller lookup. Later controller edits must not reprice
 * already-agreed GRNs or their outward charges.
 */
describe('Delivery stored agreement — delivery-stored-agreement.test.ts', () => {
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
    await CommodityRateModel.deleteMany({});
    await seedFacility({ id: FACILITY_ID, code: 'AGR', name: 'Agreement Facility' });
    customerId = await seedCustomer({ id: 'cust-agr', facilityId: FACILITY_ID, name: 'Agree Customer' });
    await CommodityModel.create({
      id: 'cmd-agr',
      name: 'Potato Agree',
      normalizedName: 'potato agree',
      isActive: true,
    });
  });

  it('keeps billing the stored agreement after controller rates change', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '8001',
        date: new Date(),
        customerId,
        commodityId: 'cmd-agr',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        smallBagPrice: 12,
        bigBagPrice: 18,
      },
      USER_ID,
    );

    const first = await deliveryService.createDelivery(
      FACILITY_ID,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(first.delivery.rentCharge).toBe(480);

    // Controller rates change afterwards: stored agreement must win.
    await commodityRateService.upsertRate({
      commodityId: 'cmd-agr',
      rentType: 'Seasonal',
      smallRate: 20,
      bigRate: 25,
    });

    const second = await deliveryService.createDelivery(
      FACILITY_ID,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(second.delivery.rentCharge).toBe(480);
  });

  it('calculates multi-period seasonal outward rent with January and February monthly rates', async () => {
    // Configure Monthly commodity rate
    await commodityRateService.upsertRate({
      commodityId: 'cmd-agr',
      rentType: 'Monthly',
      smallRate: 15,
      bigRate: 21,
    });

    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '8002',
        date: new Date('2024-07-10T00:00:00.000Z'),
        customerId,
        commodityId: 'cmd-agr',
        chamber: 'CH-01',
        bags: 200,
        bagType: 'S/B',
        smallBags: 100,
        bigBags: 100,
        rentType: 'Seasonal',
        smallBagPrice: 150,
        bigBagPrice: 210,
      },
      USER_ID,
    );

    // Deliver on Oct 11, 2026 (spans Season 2024, Jan 2025, Feb 2025, Season 2025, Jan 2026, Feb 2026, Season 2026)
    // 50 Small + 50 Big: Seasonal = 54,000, Monthly = 7,200, Total = 61,200
    const deliveryRes = await deliveryService.createDelivery(
      FACILITY_ID,
      {
        grnId: grn.id,
        date: new Date('2026-10-11T00:00:00.000Z'),
        smallBags: 50,
        bigBags: 50,
        bagCategory: 'Small & Big',
      },
      USER_ID,
    );

    expect(deliveryRes.delivery.rentCharge).toBe(61200);
  });

  it('supports S+B inward lots with partial delivery of small and big bags', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '8003',
        date: new Date('2026-04-10T00:00:00.000Z'),
        customerId,
        commodityId: 'cmd-agr',
        chamber: 'CH-01',
        bags: 200,
        bagType: 'S+B',
        smallBags: 100,
        bigBags: 100,
        rentType: 'Seasonal',
        smallBagPrice: 150,
        bigBagPrice: 210,
      },
      USER_ID,
    );

    // Operator enters 50 small and 20 big bags = 70 total
    const del = await deliveryService.createDelivery(
      FACILITY_ID,
      {
        grnId: grn.id,
        date: new Date('2026-05-15T00:00:00.000Z'),
        smallBags: 50,
        bigBags: 20,
        bagCategory: 'Small & Big',
      },
      USER_ID,
    );

    // Dispatched = 70, remaining stock = 200 - 70 = 130
    expect(del.delivery.smallBags).toBe(50);
    expect(del.delivery.bigBags).toBe(20);
    expect(del.delivery.totalBags).toBe(70);
    expect(del.summary.remainingDeliveryBalance).toBe(130);
    expect(del.summary.physicallyStoredBags).toBe(130);
    // Rent = 50 * 150 + 20 * 210 = 7,500 + 4,200 = 11,700
    expect(del.delivery.rentCharge).toBe(11700);

    // Reversal restores exact 200 bags without fragmenting single pool
    const rev = await deliveryService.reverseDelivery(
      FACILITY_ID,
      del.delivery.id,
      { reason: 'Customer changed delivery request' },
      USER_ID,
    );
    expect(rev.summary.remainingDeliveryBalance).toBe(200);
    expect(rev.summary.physicallyStoredBags).toBe(200);
  });

  it('supports all valid outward compositions (200S+0B, 0S+200B, 10S+190B) for 200-bag lots', async () => {
    // 1. All-small: 200 Small + 0 Big
    const { grn: grnSmall } = await grnService.createGrn(FACILITY_ID, {
      grnNumber: '8004', date: new Date('2026-04-10T00:00:00.000Z'),
      customerId, commodityId: 'cmd-agr', chamber: 'CH-01', bags: 200, bagType: 'S/B',
      smallBags: 200, bigBags: 0, rentType: 'Seasonal', smallBagPrice: 150, bigBagPrice: 210,
    }, USER_ID);
    const delSmall = await deliveryService.createDelivery(FACILITY_ID, {
      grnId: grnSmall.id, date: new Date('2026-05-15T00:00:00.000Z'),
      smallBags: 200, bigBags: 0,
    }, USER_ID);
    expect(delSmall.delivery.smallBags).toBe(200);
    expect(delSmall.delivery.bigBags).toBe(0);
    expect(delSmall.delivery.rentCharge).toBe(30000); // 200 * 150
    expect(delSmall.summary.remainingDeliveryBalance).toBe(0);

    // 2. All-big: 0 Small + 200 Big
    const { grn: grnBig } = await grnService.createGrn(FACILITY_ID, {
      grnNumber: '8005', date: new Date('2026-04-10T00:00:00.000Z'),
      customerId, commodityId: 'cmd-agr', chamber: 'CH-01', bags: 200, bagType: 'S/B',
      smallBags: 0, bigBags: 200, rentType: 'Seasonal', smallBagPrice: 150, bigBagPrice: 210,
    }, USER_ID);
    const delBig = await deliveryService.createDelivery(FACILITY_ID, {
      grnId: grnBig.id, date: new Date('2026-05-15T00:00:00.000Z'),
      smallBags: 0, bigBags: 200,
    }, USER_ID);
    expect(delBig.delivery.smallBags).toBe(0);
    expect(delBig.delivery.bigBags).toBe(200);
    expect(delBig.delivery.rentCharge).toBe(42000); // 200 * 210
    expect(delBig.summary.remainingDeliveryBalance).toBe(0);

    // 3. Mixed Partial (10S + 90B = 100, rem = 100) then Final (0S + 100B = 100, rem = 0)
    const { grn: grnMixed } = await grnService.createGrn(FACILITY_ID, {
      grnNumber: '8006', date: new Date('2026-04-10T00:00:00.000Z'),
      customerId, commodityId: 'cmd-agr', chamber: 'CH-01', bags: 200, bagType: 'S/B',
      smallBags: 10, bigBags: 190, rentType: 'Seasonal', smallBagPrice: 150, bigBagPrice: 210,
    }, USER_ID);
    const delPart = await deliveryService.createDelivery(FACILITY_ID, {
      grnId: grnMixed.id, date: new Date('2026-05-15T00:00:00.000Z'),
      smallBags: 10, bigBags: 90,
    }, USER_ID);
    expect(delPart.delivery.smallBags).toBe(10);
    expect(delPart.delivery.bigBags).toBe(90);
    expect(delPart.delivery.rentCharge).toBe(20400); // 10*150 + 90*210
    expect(delPart.summary.remainingDeliveryBalance).toBe(100);

    const delFinal = await deliveryService.createDelivery(FACILITY_ID, {
      grnId: grnMixed.id, date: new Date('2026-05-15T00:00:00.000Z'),
      smallBags: 0, bigBags: 100,
    }, USER_ID);
    expect(delFinal.delivery.smallBags).toBe(0);
    expect(delFinal.delivery.bigBags).toBe(100);
    expect(delFinal.delivery.rentCharge).toBe(21000); // 100*210
    expect(delFinal.summary.remainingDeliveryBalance).toBe(0);
  });
});
