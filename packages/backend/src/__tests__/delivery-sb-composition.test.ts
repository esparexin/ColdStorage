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

const USER_ID = 'usr-sb-composition';

describe('Flexible S/B Bag Composition & Non-Negative Inventory (Phase 2)', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'SB Facility' });
    customerId = await seedCustomer({ facilityId, name: 'SB Customer' });
    await CommodityModel.create({
      id: 'cmd-potato-sb',
      name: 'Potato SB',
      normalizedName: 'potato sb',
      isActive: true,
      defaultBagType: 'S/B',
    });
  });

  it('delivers Big bags from unsegregated S/B lot without creating negative inventory in ledger', async () => {
    // Inward receipt declared as unsegregated S/B (100 bags total, no split)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'SB-01',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato-sb',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 15,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // Initial ledger balance
    const initBalance = await readLedgerBalance(facilityId, grn.id);
    expect(initBalance.total).toBe(100);

    // Outward delivery of 40 Big bags
    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        smallBags: 0,
        bigBags: 40,
        bagCategory: 'Big',
      },
      USER_ID,
    );

    // Challan correctly records 40 Big bags and charges ₹15/bag = ₹600
    expect(del.delivery.smallBags).toBe(0);
    expect(del.delivery.bigBags).toBe(40);
    expect(del.delivery.totalBags).toBe(40);
    expect(del.delivery.rentCharge).toBe(600);

    // Ledger balance has zero negative stock on either side
    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.smallBags).toBeGreaterThanOrEqual(0);
    expect(balance.bigBags).toBeGreaterThanOrEqual(0);
    expect(balance.total).toBe(60);
    expect(del.summary.remainingDeliveryBalance).toBe(60);
  });

  it('allows full sequential dispatch of mixed bags to zero remaining balance', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'SB-02',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato-sb',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBagPrice: 10,
        bigBagPrice: 15,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // Delivery 1: 50 Big bags
    await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 0, bigBags: 50 },
      USER_ID,
    );

    let bal = await readLedgerBalance(facilityId, grn.id);
    expect(bal.total).toBe(50);
    expect(bal.smallBags).toBeGreaterThanOrEqual(0);
    expect(bal.bigBags).toBeGreaterThanOrEqual(0);

    // Delivery 2: 50 Small bags
    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 50, bigBags: 0 },
      USER_ID,
    );

    bal = await readLedgerBalance(facilityId, grn.id);
    expect(bal.total).toBe(0);
    expect(bal.smallBags).toBe(0);
    expect(bal.bigBags).toBe(0);
    expect(d2.summary.remainingDeliveryBalance).toBe(0);
  });
});
