import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-sorting-partial';

describe('GRN Sorting & Repacking with Partial Deliveries (Phase 2)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-sort-p-admin',
      username: 'sort.p.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'SPD', name: 'Partial Delivery Facility' });
    customerId = await seedCustomer({ id: 'cust-spd-1', facilityId, name: 'Farmer Ramesh' });
    const cmd = await CommodityModel.create({
      id: 'cmd-onion', name: 'Onion', normalizedName: 'onion', isActive: true, isHamaliApplicable: true, hamaliRate: 3,
    });
    commodityId = cmd.id;
  });

  it('validates confirmation and repacking variance against live stock after partial delivery', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Onion',
      chamber: 'CH-02',
      bags: 100,
      bagType: 'S/B',
      smallBags: 60,
      bigBags: 40,
      rentType: 'Seasonal',
      rentAmount: 4000,
      grnNumber: 'GRN-26-27-0201',
    });

    // 1. Simulate a partial outward delivery of 20 bags (10 small, 10 big)
    await InventoryTransactionModel.create({
      id: 'tx-cust-del-01',
      facilityId,
      grnId,
      grnNumber: 'GRN-26-27-0201',
      chamber: 'CH-02',
      commodityId,
      bagType: 'S/B',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 10,
      bigQuantity: 10,
      referenceType: 'DELIVERY',
      referenceId: 'del-cust-01',
      notes: 'Customer dispatch',
      createdBy: 'usr-sort-p-admin',
      createdAt: new Date(),
    });

    // Check available balance before sorting: 100 - 20 = 80
    const balBefore = await readLedgerBalance(facilityId, grnId);
    expect(balBefore.total).toBe(80);
    expect(balBefore.smallBags).toBe(50);
    expect(balBefore.bigBags).toBe(30);

    // 2. Sorting Step: attempting to confirm intake bags (100) must fail
    const failSortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100, // Should be 80!
      });
    expect(failSortRes.status).toBe(400);
    expect(failSortRes.body.error).toContain('CONFIRMATION_MISMATCH');

    // Confirming live stock (80 bags) must succeed
    const okSortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 80,
        totalBagsWeight: 4100,
        paymentMode: 'Cash',
      });
    expect(okSortRes.status).toBe(200);
    expect(okSortRes.body.success).toBe(true);
    expect(okSortRes.body.isSortingComplete).toBe(true);

    // 3. Repacking Step: repack 80 remaining bags into 76 bags (50 small, 26 big, -4 variance)
    const repackRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        resultingBagType: 'S/B',
        repackedSmallBags: 50,
        repackedBigBags: 26,
        repackVarianceReason: 'Cull removal during grading',
        referenceWeight: 3900,
        remarks: 'Repacked partial lot',
      });
    expect(repackRes.status).toBe(200);
    expect(repackRes.body.success).toBe(true);
    // Repack variance is 76 - 80 = -4 (not 76 - 100 = -24)
    expect(repackRes.body.repackVariance).toBe(-4);
    // Hamali: 76 * 3 = 228
    expect(repackRes.body.hamaliCharge).toBe(228);

    // 4. Verify InternalMovement document audit snapshot
    const movement = await InternalMovementModel.findOne({ targetGrnId: grnId, movementType: 'REPACK' }).lean().exec();
    expect(movement?.repackSourceBags).toBe(80);
    expect(movement?.repackVariance).toBe(-4);

    // 5. Verify GRN and Ledger State
    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.bags).toBe(96); // 100 + (-4)
    expect(grn?.smallBags).toBe(60);
    expect(grn?.bigBags).toBe(36);

    const balAfter = await readLedgerBalance(facilityId, grnId);
    expect(balAfter.total).toBe(76);
    expect(balAfter.smallBags).toBe(50);
    expect(balAfter.bigBags).toBe(26);

    const grnEntity = await grnService.getGrnById(grnId);
    expect(grnEntity?.bags).toBe(96);
    expect(grnEntity?.netDeliveredBags).toBe(20);
    expect(grnEntity?.closingBags).toBe(76);

    // 6. Verify Truthful Movement History Mapping (INTERNAL_REPACK, not customer dispatches)
    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history?.netDeliveredBags).toBe(20);
    expect(history?.currentClosingBags).toBe(76);
    expect(history?.entries).toHaveLength(4);
    expect(history?.entries[0].type).toBe('INWARD');
    expect(history?.entries[1].type).toBe('PARTIAL_OUTWARD');
    expect(history?.entries[2].type).toBe('INTERNAL_REPACK');
    expect(history?.entries[3].type).toBe('INTERNAL_REPACK');
  });

  it('safely replays sorting and repacking requests idempotently', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Onion', chamber: 'CH-02',
      bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 2000,
      grnNumber: 'GRN-26-27-0202',
    });

    const sort1 = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmedBagType: 'S', confirmedBags: 50 });
    expect(sort1.status).toBe(200);

    // Replay sort: returns isSortingComplete: true without error
    const sort2 = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmedBagType: 'S', confirmedBags: 50 });
    expect(sort2.status).toBe(200);
    expect(sort2.body.isSortingComplete).toBe(true);

    const idemKey = 'idem-repack-test-01';
    const repack1 = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, resultingBagType: 'S', repackedSmallBags: 48, repackedBigBags: 0,
        repackVarianceReason: 'Culls', remarks: 'Repack', idempotencyKey: idemKey,
      });
    expect(repack1.status).toBe(200);

    const txCountBefore = await InventoryTransactionModel.countDocuments({ grnId });

    // Replay repack with same idempotencyKey: returns cached result without duplicate ledger entries
    const repack2 = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, resultingBagType: 'S', repackedSmallBags: 48, repackedBigBags: 0,
        repackVarianceReason: 'Culls', remarks: 'Repack', idempotencyKey: idemKey,
      });
    expect(repack2.status).toBe(200);
    expect(repack2.body.movement.id).toBe(repack1.body.movement.id);

    const txCountAfter = await InventoryTransactionModel.countDocuments({ grnId });
    expect(txCountAfter).toBe(txCountBefore);
  });
});
