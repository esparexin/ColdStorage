import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-cross-wf';

describe('Cross-Workflow Lifecycle: Inward -> Internal Movement -> Subsequent Outward', () => {
  let adminToken: string;
  let customerA: string;
  let customerB: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-cross-admin',
      username: 'cross.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await mongoose.connection.collection('deliverychallans').deleteMany({});
    await seedFacility({ id: facilityId, code: 'CWF', name: 'Cross Workflow Facility' });

    customerA = await seedCustomer({ id: 'cust-cwf-a', facilityId, name: 'Farmer Ramesh' });
    customerB = await seedCustomer({ id: 'cust-cwf-b', facilityId, name: 'Trader Suresh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-cwf-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
    });
    commodityId = cmd.id;
    await seedControllerRates(commodityId, { small: 10, big: 15 }, { small: 10, big: 15 });
  });

  it('Sorting & Repacking -> Subsequent Outward preserves timeline dates and chamber', async () => {
    const genesisDate = new Date('2026-03-01T10:00:00.000Z');
    const grnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Potato', chamber: 'CH-01', bags: 100,
      bagType: 'S/B', smallBags: 100, bigBags: 0, rentType: 'Seasonal',
      rentAmount: 2000, date: genesisDate, grnNumber: 'GRN-CWF-0001',
    });

    const sortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmedBagType: 'S/B', confirmedBags: 100 });
    expect(sortRes.status).toBe(200);

    const repackRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, resultingBagType: 'S/B', repackedSmallBags: 60, repackedBigBags: 40,
        destinationChamber: 'CH-07', remarks: 'Repacked into new chamber',
      });
    expect(repackRes.status).toBe(200);

    const grnAfterRepack = await GrnModel.findOne({ id: grnId }).lean();
    expect(grnAfterRepack?.chamber).toBe('CH-07');
    expect(grnAfterRepack?.isCompositionVerified).toBe(true);
    expect(grnAfterRepack?.smallBags).toBe(60);
    expect(grnAfterRepack?.bigBags).toBe(40);

    const delDate = new Date(Date.now() + 2000);
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, date: delDate, smallBags: 60, bigBags: 40,
        remarks: 'Subsequent outward delivery from repacked lot',
        paymentAmount: 2000, paymentMode: 'Cash',
      });
    expect(delRes.status).toBe(201);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.status).toBe('CLOSED');
    expect(history!.currentClosingBags).toBe(0);

    const types = history!.entries.map((e) => e.type);
    expect(types).toContain('INWARD');
    expect(types).toContain('INTERNAL_REPACK');
    expect(types).toContain('FINAL_OUTWARD');

    const inward = history!.entries.find((e) => e.type === 'INWARD')!;
    expect(new Date(inward.date).toISOString()).toBe(genesisDate.toISOString());
    expect(inward.closingBags).toBe(100);

    const outward = history!.entries.find((e) => e.type === 'FINAL_OUTWARD')!;
    expect(outward.deliveredBags).toBe(100);
    expect(outward.closingBags).toBe(0);
    expect(new Date(outward.date).toISOString()).toBe(delDate.toISOString());
  });

  it('Transfer Ownership with Repack -> Subsequent Outward preserves dates and updates owner', async () => {
    const genesisDate = new Date('2026-02-01T09:00:00.000Z');
    const grnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Potato', chamber: 'CH-02', bags: 50,
      bagType: 'S/B', smallBags: 50, bigBags: 0, rentType: 'Seasonal',
      rentAmount: 1000, date: genesisDate, grnNumber: 'GRN-CWF-0002',
    });

    const transferDate = new Date('2026-02-15T11:00:00.000Z');
    const trfRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, newCustomerId: customerB, movementDate: transferDate,
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: { amountPaid: 1000, paymentMode: 'UPI' },
        resultingBagType: 'S/B', repackedSmallBags: 30, repackedBigBags: 20,
        destinationChamber: 'CH-09', referenceWeight: 2500,
        remarks: 'Transfer ownership with repacking',
      });
    expect(trfRes.status).toBe(200);

    const grnAfterTrf = await GrnModel.findOne({ id: grnId }).lean();
    expect(grnAfterTrf?.customerId).toBe(customerB);
    expect(grnAfterTrf?.chamber).toBe('CH-09');
    expect(grnAfterTrf?.isCompositionVerified).toBe(true);
    expect(grnAfterTrf?.smallBags).toBe(30);
    expect(grnAfterTrf?.bigBags).toBe(20);

    const delDate = new Date('2026-02-28T16:00:00.000Z');
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, date: delDate, smallBags: 30, bigBags: 20,
        remarks: 'Subsequent outward by new owner Suresh',
      });
    expect(delRes.status).toBe(201);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.currentClosingBags).toBe(0);

    const types = history!.entries.map((e) => e.type);
    expect(types).toContain('INWARD');
    expect(types).toContain('OWNERSHIP_TRANSFER');
    expect(types).toContain('FINAL_OUTWARD');

    const inward = history!.entries.find((e) => e.type === 'INWARD')!;
    expect(new Date(inward.date).toISOString()).toBe(genesisDate.toISOString());

    const transfer = history!.entries.find((e) => e.type === 'OWNERSHIP_TRANSFER')!;
    expect(new Date(transfer.date).toISOString()).toBe(transferDate.toISOString());
    expect(transfer.remarks).toContain('Trader Suresh');

    const outward = history!.entries.find((e) => e.type === 'FINAL_OUTWARD')!;
    expect(outward.deliveredBags).toBe(50);
    expect(outward.closingBags).toBe(0);
  });

  it('Merge with Repack -> Subsequent Outward delivers consolidated lot cleanly', async () => {
    const targetDate = new Date('2026-01-10T10:00:00.000Z');
    const targetId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Potato', chamber: 'CH-03', bags: 60,
      bagType: 'S/B', smallBags: 35, bigBags: 25, rentType: 'Seasonal',
      rentAmount: 1200, date: targetDate, grnNumber: 'GRN-CWF-0003',
    });

    const sourceDate = new Date('2026-01-12T10:00:00.000Z');
    const sourceId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Potato', chamber: 'CH-03', bags: 40,
      bagType: 'S/B', smallBags: 25, bigBags: 15, rentType: 'Seasonal',
      rentAmount: 800, date: sourceDate, grnNumber: 'GRN-CWF-0004',
    });

    const mergeDate = new Date('2026-01-20T10:00:00.000Z');
    const mergeRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId, sourceGrnIds: [sourceId], movementDate: mergeDate,
        destinationChamber: 'CH-11', isRepackSelected: true,
        repackedSmallBags: 25, repackedBigBags: 15, repackedBagCount: 40,
        remarks: 'Consolidation merge into chamber CH-11',
      });
    expect(mergeRes.status).toBe(200);

    const targetAfterMerge = await GrnModel.findOne({ id: targetId }).lean();
    expect(targetAfterMerge?.chamber).toBe('CH-11');
    expect(targetAfterMerge?.bags).toBe(100);
    expect(targetAfterMerge?.smallBags).toBe(60);
    expect(targetAfterMerge?.bigBags).toBe(40);
    expect(targetAfterMerge?.isCompositionVerified).toBe(true);

    const sourceAfterMerge = await GrnModel.findOne({ id: sourceId }).lean();
    expect(sourceAfterMerge?.status).toBe('CLOSED');

    const delDate = new Date('2026-01-30T10:00:00.000Z');
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: targetId, date: delDate, smallBags: 60, bigBags: 40,
        remarks: 'Full outward of merged lot',
        paymentAmount: 1200, paymentMode: 'Cash',
      });
    expect(delRes.status).toBe(201);

    const targetHistory = await getGrnMovementHistory(facilityId, targetId);
    expect(targetHistory).not.toBeNull();
    expect(targetHistory!.status).toBe('CLOSED');
    expect(targetHistory!.currentClosingBags).toBe(0);

    const types = targetHistory!.entries.map((e) => e.type);
    expect(types).toContain('INWARD');
    expect(types).toContain('INTERNAL_MERGE_IN');
    expect(types).toContain('FINAL_OUTWARD');

    const inward = targetHistory!.entries.find((e) => e.type === 'INWARD')!;
    expect(new Date(inward.date).toISOString()).toBe(targetDate.toISOString());

    const mergeIn = targetHistory!.entries.find((e) => e.type === 'INTERNAL_MERGE_IN')!;
    expect(new Date(mergeIn.date).toISOString()).toBe(mergeDate.toISOString());

    const outward = targetHistory!.entries.find((e) => e.type === 'FINAL_OUTWARD')!;
    expect(outward.deliveredBags).toBe(100);
    expect(outward.closingBags).toBe(0);
  });
});
