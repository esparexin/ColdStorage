import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
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

describe('Exact S/B Bag Composition & Non-Negative Inventory (Phase 2)', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-potato-sb-s', commodityId: 'cmd-potato-sb', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-potato-sb-m', commodityId: 'cmd-potato-sb', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
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

  it('rejects cross-pool withdrawal from an unsegregated lot with an exact-reconciliation error', async () => {
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
        rentAmount: 0,
      },
      USER_ID,
    );

    // Initial ledger balance
    const initBalance = await readLedgerBalance(facilityId, grn.id);
    expect(initBalance.total).toBe(100);

    // Cross-pool withdrawal (40 Big from an all-small-recorded pool) is rejected
    await expect(
      deliveryService.createDelivery(
        facilityId,
        { grnId: grn.id, smallBags: 0, bigBags: 40, bagCategory: 'Big' },
        USER_ID,
      ),
    ).rejects.toThrow(/reconcile exactly/);

    // Rejection leaves the ledger untouched
    const untouched = await readLedgerBalance(facilityId, grn.id);
    expect(untouched.smallBags).toBe(100);
    expect(untouched.bigBags).toBe(0);
    expect(untouched.total).toBe(100);

    // Pool-matching withdrawal succeeds and charges ₹10/bag = ₹400
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(del.delivery.smallBags).toBe(40);
    expect(del.delivery.bigBags).toBe(0);
    expect(del.delivery.rentCharge).toBe(400);

    // Ledger balance has zero negative stock on either side
    const balance = await readLedgerBalance(facilityId, grn.id);
    expect(balance.smallBags).toBe(60);
    expect(balance.bigBags).toBe(0);
    expect(balance.total).toBe(60);
    expect(del.summary.remainingDeliveryBalance).toBe(60);
  });

  it('allows full sequential dispatch of pool-matching withdrawals to zero remaining balance', async () => {
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
        rentAmount: 0,
      },
      USER_ID,
    );

    // Delivery 1: 60 Small bags (pool-matching)
    await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 60, bigBags: 0 },
      USER_ID,
    );

    let bal = await readLedgerBalance(facilityId, grn.id);
    expect(bal.total).toBe(40);
    expect(bal.smallBags).toBe(40);
    expect(bal.bigBags).toBe(0);

    // Delivery 2: remaining 40 Small bags
    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0 },
      USER_ID,
    );

    bal = await readLedgerBalance(facilityId, grn.id);
    expect(bal.total).toBe(0);
    expect(bal.smallBags).toBe(0);
    expect(bal.bigBags).toBe(0);
    expect(d2.summary.remainingDeliveryBalance).toBe(0);
  });

  it('rejects delivery without confirmed bag composition when storage rates differ', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '9003',
        date: new Date(),
        customerId,
        commodityId: 'cmd-potato-sb',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBags: 60,
        bigBags: 40,
        smallBagPrice: 10,
        bigBagPrice: 15,
        rentType: 'Seasonal',
        rentAmount: 0,
      },
      USER_ID,
    );

    await expect(
      deliveryService.createDelivery(
        facilityId,
        { grnId: grn.id, quantity: 50 },
        USER_ID,
      ),
    ).rejects.toThrow('Small and big bag composition required for delivery when storage rates differ');
  });
});
