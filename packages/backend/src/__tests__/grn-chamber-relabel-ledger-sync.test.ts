import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { nextTestGrnNumber } from './helpers/grn-number-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-chamber-sync-01';

describe('GRN Chamber Relabel Ledger Synchronization', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-ch-sync-admin',
      username: 'chamber.sync.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-wheat-sync-s', commodityId: 'cmd-wheat-sync', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-wheat-sync-m', commodityId: 'cmd-wheat-sync', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    await seedFacility({ id: facilityId, code: 'CHSFAC', name: 'Chamber Sync Facility' });
    customerId = await seedCustomer({ id: 'cust-ch-sync', facilityId, name: 'Suresh Kumar' });
    const commodity = await CommodityModel.create({
      id: 'cmd-wheat-sync',
      name: 'Sharbati Wheat',
      normalizedName: 'sharbati wheat sync',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  it('synchronizes all ledger movements (inward and outward) when chamber is relabeled', async () => {
    // 1. Create GRN in initial chamber CH-ALPHA
    const inwardRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: nextTestGrnNumber(),
        date: new Date().toISOString(),
        customerId,
        commodityId,
        chamber: 'CH-ALPHA',
        bags: 100,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        rentAmount: 4000,
        bagPrice: 40,
        smallBags: 100,
        bigBags: 0,
      });

    expect(inwardRes.status).toBe(201);
    const grnId = inwardRes.body.grn.id;

    // 2. Issue partial delivery of 30 bags while in CH-ALPHA
    const deliveryResult = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 30, bigBags: 0 },
      'usr-ch-sync-admin',
    );
    expect(deliveryResult.delivery.id).toBeDefined();

    // Verify interim facility inventory summary
    const interimSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(interimSummary.totalStockBags).toBe(70);
    expect(interimSummary.byChamber).toEqual([{ chamber: 'CH-ALPHA', totalBags: 70 }]);

    // 3. Relabel chamber from CH-ALPHA to CH-BETA via administrative correction
    const correctRes = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        chamber: 'CH-BETA',
        reason: 'Administrative chamber re-allocation after storage reorganization',
      });

    expect(correctRes.status).toBe(200);
    expect(correctRes.body.grn.chamber).toBe('CH-BETA');

    // 4. Verify DeliveryChallanModel has updated chamber
    const challanDoc = await DeliveryChallanModel.findOne({ id: deliveryResult.delivery.id }).lean();
    expect(challanDoc?.chamber).toBe('CH-BETA');

    // 5. Verify ALL inventory transactions for this GRN reflect CH-BETA
    const allTxns = await InventoryTransactionModel.find({ facilityId, grnId }).lean();
    expect(allTxns.length).toBe(2);
    for (const tx of allTxns) {
      expect(tx.chamber).toBe('CH-BETA');
    }

    // 6. Verify facility inventory summary computes balanced, accurate stock
    const finalSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(finalSummary.totalStockBags).toBe(70);
    expect(finalSummary.byChamber).toEqual([{ chamber: 'CH-BETA', totalBags: 70 }]);
  });

  it('preserves settled reversed deliveries on original chamber while synchronizing active deliveries', async () => {
    // 1. Create GRN in initial chamber CH-ORIGIN
    const inwardRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: nextTestGrnNumber(),
        date: new Date().toISOString(),
        customerId,
        commodityId,
        chamber: 'CH-ORIGIN',
        bags: 100,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        rentAmount: 4000,
        bagPrice: 40,
        smallBags: 100,
        bigBags: 0,
      });

    expect(inwardRes.status).toBe(201);
    const grnId = inwardRes.body.grn.id;

    // 2. Delivery 1: 20 bags delivered and then reversed (settled history)
    const del1 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 20, bigBags: 0 },
      'usr-ch-sync-admin',
    );
    await deliveryService.reverseDelivery(
      facilityId,
      del1.delivery.id,
      { reason: 'Customer requested cancellation at gate' },
      'usr-ch-sync-admin',
    );

    // 3. Delivery 2: 30 bags delivered (active ISSUED delivery)
    const del2 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 30, bigBags: 0 },
      'usr-ch-sync-admin',
    );

    // 4. Chamber corrected from CH-ORIGIN to CH-DEST
    const correctRes = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        chamber: 'CH-DEST',
        reason: 'Relocated remaining lot to clean bay',
      });
    expect(correctRes.status).toBe(200);

    // 5. Inward putaway and active delivery are on CH-DEST
    const inward = await InventoryTransactionModel.findOne({ grnId, transactionType: 'INWARD_PUTAWAY' }).lean();
    expect(inward?.chamber).toBe('CH-DEST');

    const activeOutward = await InventoryTransactionModel.findOne({
      grnId,
      referenceType: 'DELIVERY',
      referenceId: del2.delivery.id,
    }).lean();
    expect(activeOutward?.chamber).toBe('CH-DEST');

    // 6. Settled reversed delivery rows stay on CH-ORIGIN
    const settledOutward = await InventoryTransactionModel.findOne({
      grnId,
      referenceType: 'DELIVERY',
      referenceId: del1.delivery.id,
    }).lean();
    expect(settledOutward?.chamber).toBe('CH-ORIGIN');

    const settledReversal = await InventoryTransactionModel.findOne({
      grnId,
      transactionType: 'DELIVERY_REVERSAL',
    }).lean();
    expect(settledReversal?.chamber).toBe('CH-ORIGIN');

    // 7. Inventory rollup accurately reflects remaining stock on CH-DEST
    const summary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(summary.totalStockBags).toBe(70);
    expect(summary.byChamber).toEqual([{ chamber: 'CH-DEST', totalBags: 70 }]);
  });
});
