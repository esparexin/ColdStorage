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

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

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
});
