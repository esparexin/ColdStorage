import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-repack-val-flow';

describe('Integration: Internal Merge Repacking Validations', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-val',
      username: 'merge.val',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'RVF', name: 'Repack Val Facility' });
    customerId = await seedCustomer({ id: 'cust-rvf-01', facilityId, name: 'Farmer Ramesh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-rvf-potato', name: 'Potato', normalizedName: 'potato', isActive: true,
    });
    commodityId = cmd.id;
  });

  async function seedTestGrnPair() {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Potato',
      chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 60, bigBags: 40,
      rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-TGT',
      smallBagPrice: 20, bigBagPrice: 20,
    });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Potato',
      chamber: 'CH-02', bags: 50, bagType: 'S+B', smallBags: 25, bigBags: 25,
      rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-SRC',
      smallBagPrice: 20, bigBagPrice: 20,
    });
    return { targetGrnId, sourceGrnId };
  }

  it('rejects negative or fractional repacked counts', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();

    const negRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        isRepackSelected: true, repackedSmallBags: -10, repackedBigBags: 60, remarks: 'Negative counts',
      });
    expect(negRes.status).toBe(400);
    expect(negRes.body.error).toBe('Validation failed');

    const fracRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        isRepackSelected: true, repackedSmallBags: 25.5, repackedBigBags: 24.5, remarks: 'Fractional counts',
      });
    expect(fracRes.status).toBe(400);
    expect(fracRes.body.error).toBe('Validation failed');
  });

  it('rejects Hybrid confirmation when confirmed quantity mismatches moved stock', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        sourceBagCategory: 'Hybrid', sourceQuantity: 45, sourceBagPrice: 20, remarks: 'Mismatched hybrid quantity',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must match total moved stock of 50 bags/);
  });

  it('rejects outward confirmed quantity exceeding Total Bags when not repacking', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        repackedSmallBags: 35, repackedBigBags: 20, isRepackSelected: false, remarks: 'Exceeding total',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot exceed Total Bags \(50\)/);
  });

  it('accepts exact Total Bags when not repacking', async () => {
    const { targetGrnId, sourceGrnId } = await seedTestGrnPair();
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date(),
        repackedSmallBags: 50, repackedBigBags: 0, isRepackSelected: false, remarks: 'Exact total',
      });
    expect(res.status).toBe(200);
    expect(res.body.movement.smallBagsMoved).toBe(50);
    expect(res.body.movement.bigBagsMoved).toBe(0);
  });
});
