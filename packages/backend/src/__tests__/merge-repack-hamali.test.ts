import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-repack-hamali';

describe('Merge Repacking Hamali Charge Accounting', () => {
  let adminToken: string;
  let customerId: string;
  let hamaliCommodityId: string;
  let nonHamaliCommodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-repack-admin',
      username: 'repack.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'RPH', name: 'Repack Hamali Facility' });
    customerId = await seedCustomer({ id: 'cust-rph-01', facilityId, name: 'Trader Vikas' });

    const c1 = await CommodityModel.create({
      id: 'cmd-hamali-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      isHamaliApplicable: true,
      hamaliRate: 4,
    });
    hamaliCommodityId = c1.id;

    const c2 = await CommodityModel.create({
      id: 'cmd-no-hamali-wheat',
      name: 'Wheat Grain',
      normalizedName: 'wheatgrain',
      isActive: true,
      isHamaliApplicable: false,
      hamaliRate: 0,
    });
    nonHamaliCommodityId = c2.id;
  });

  it('charges qualifying repacking hamali when repacking counts are explicitly supplied', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40,
      bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0301',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20,
      bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0302',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        repackedSmallBags: 30,
        repackedBigBags: 20,
        remarks: 'Repacked 50 bags into 30S and 20B',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Repacking hamali = 50 moved bags * 4/bag = 200.
    // Source pending obligation = 1000 base rent + 200 inward hamali = 1200.
    // Target rent = 2000 initial + 1200 source pending + 200 repacking hamali = 3400.
    expect(res.body.targetGrn.rentAmount).toBe(3400);
    expect(res.body.movement.hamaliCharge).toBe(200);
    expect(res.body.movement.hamaliBags).toBe(50);
    expect(res.body.movement.hamaliRate).toBe(4);
    expect(res.body.movement.financialSnapshot.hamaliAmount).toBe(200);
    expect(res.body.targetGrn.remarks).toContain('Repacking Hamali: ₹200 (50 bags @ ₹4/bag)');
  });

  it('charges zero repacking hamali when merge is performed without repacking', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40,
      bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0303',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20,
      bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0304',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Direct merge without repacking',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Repacking hamali = 0.
    // Source pending obligation = 1000 base rent + 200 inward hamali = 1200.
    // Target rent = 2000 initial + 1200 source pending + 0 repacking = 3200.
    expect(res.body.targetGrn.rentAmount).toBe(3200);
    expect(res.body.movement.hamaliCharge ?? 0).toBe(0);
    expect('hamaliCharge' in res.body.movement).toBe(false);
    expect(res.body.targetGrn.remarks).not.toContain('Repacking Hamali');
  });

  it('charges zero repacking hamali when commodity has hamali disabled', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: nonHamaliCommodityId,
      commodityName: 'Wheat Grain', chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40,
      bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0305',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: nonHamaliCommodityId,
      commodityName: 'Wheat Grain', chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20,
      bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0306',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        repackedSmallBags: 30,
        repackedBigBags: 20,
        remarks: 'Repacked wheat with zero configured hamali',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetGrn.rentAmount).toBe(3000);
    expect(res.body.movement.hamaliCharge ?? 0).toBe(0);
    expect('hamaliCharge' in res.body.movement).toBe(false);
  });
});
