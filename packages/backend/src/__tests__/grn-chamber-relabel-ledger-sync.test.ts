import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
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
});
