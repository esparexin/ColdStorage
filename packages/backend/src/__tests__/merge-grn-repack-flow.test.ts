import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-repack-merge-flow';

describe('Integration: Internal Merge with Repacking Flow (GRN 23 = 150 bags, GRN 26 = 50 bags)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-tester', username: 'merge.tester', role: 'ADMIN', facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'RMF', name: 'Repack Merge Facility' });
    customerId = await seedCustomer({ id: 'cust-rmf-01', facilityId, name: 'Farmer Ramesh' });

    await CommodityRateModel.create([
      { id: 'crt-rmf-s', commodityId: 'cmd-rmf-potato', rentType: 'Seasonal', smallRate: 20, bigRate: 25, isActive: true },
      { id: 'crt-rmf-m', commodityId: 'cmd-rmf-potato', rentType: 'Monthly', smallRate: 5, bigRate: 7, isActive: true },
    ]);

    const cmd = await CommodityModel.create({
      id: 'cmd-rmf-potato', name: 'Cold Storage Potato', normalizedName: 'cold storage potato',
      isActive: true, isHamaliApplicable: true, hamaliRate: 3,
    });
    commodityId = cmd.id;
  });

  async function seedTestGrnPair(opts?: {
    targetRentType?: 'Seasonal' | 'Monthly'; targetRentAmount?: number;
    sourceRentType?: 'Seasonal' | 'Monthly'; sourceRentAmount?: number;
  }) {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Cold Storage Potato',
      chamber: 'CH-NORTH-01', bags: 150, bagType: 'S+B', smallBags: 90, bigBags: 60,
      rentType: opts?.targetRentType ?? 'Seasonal', rentAmount: opts?.targetRentAmount ?? 3000, grnNumber: 'GRN-23',
    });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Cold Storage Potato',
      chamber: 'CH-NORTH-02', bags: 50, bagType: 'S+B', smallBags: 25, bigBags: 25,
      rentType: opts?.sourceRentType ?? 'Seasonal', rentAmount: opts?.sourceRentAmount ?? 1000, grnNumber: 'GRN-26',
    });
    return { targetGrnId, sourceGrnId };
  }

  it('1. Merges GRN 26 (50 bags) into GRN 23 (150 bags) with S/B Repacking & composition confirmation', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();
    const initialTargetBal = await readLedgerBalance(facilityId, targetGrnId);
    expect(initialTargetBal.total).toBe(150);

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        isRepackSelected: true, repackedSmallBags: 35, repackedBigBags: 15,
        remarks: 'Repacked 50 bags of GRN 26 into 35S + 15B and merged into GRN 23',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedTarget = await GrnModel.findOne({ id: targetGrnId }).lean();
    expect(updatedTarget?.bags).toBe(200);
    expect(updatedTarget?.smallBags).toBe(125);
    expect(updatedTarget?.bigBags).toBe(75);
    expect(updatedTarget?.isCompositionVerified).toBe(true);
    // Target retains 3000 initial + 150 repacking hamali = 3150 under independent billing
    expect(updatedTarget?.rentAmount).toBe(3150);

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean();
    expect(updatedSource?.status).toBe('CLOSED');

    const finalTargetBal = await readLedgerBalance(facilityId, targetGrnId);
    expect(finalTargetBal.total).toBe(200);
    const finalSourceBal = await readLedgerBalance(facilityId, sourceGrnId);
    expect(finalSourceBal.total).toBe(0);

    const movement = await InternalMovementModel.findOne({ targetGrnId }).lean();
    expect(movement?.movementType).toBe('MERGE');
    expect(movement?.totalBagsMoved).toBe(50);
  });

  it('2. Merges GRN 26 (50 bags) into GRN 23 (150 bags) with Hybrid Confirmation and rate validation', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        sourceBagCategory: 'Hybrid', sourceQuantity: 50, sourceBagPrice: 22,
        remarks: 'Confirmed 50 bags as Hybrid and merged into GRN 23',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedTarget = await GrnModel.findOne({ id: targetGrnId }).lean();
    expect(updatedTarget?.bags).toBe(200);
    expect(updatedTarget?.isCompositionVerified).toBe(true);

    const finalTargetBal = await readLedgerBalance(facilityId, targetGrnId);
    expect(finalTargetBal.total).toBe(200);
    const finalSourceBal = await readLedgerBalance(facilityId, sourceGrnId);
    expect(finalSourceBal.total).toBe(0);
  });

  it('3. Allows repacking with altered physical bag counts without validation against previous counts', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        isRepackSelected: true, repackedSmallBags: 20, repackedBigBags: 20,
        remarks: 'Physical repacking resulted in 20S + 20B = 40 bags',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedTarget = await GrnModel.findOne({ id: targetGrnId }).lean();
    expect(updatedTarget?.bags).toBe(190);
    expect(updatedTarget?.smallBags).toBe(110);
    expect(updatedTarget?.bigBags).toBe(80);

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean();
    expect(updatedSource?.status).toBe('CLOSED');

    const targetBal = await readLedgerBalance(facilityId, targetGrnId);
    expect(targetBal.total).toBe(190);
    const sourceBal = await readLedgerBalance(facilityId, sourceGrnId);
    expect(sourceBal.total).toBe(0);
  });
});
