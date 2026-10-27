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
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-hamali-potato-s', commodityId: 'cmd-hamali-potato', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-hamali-potato-m', commodityId: 'cmd-hamali-potato', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    await CommodityRateModel.create([{ id: 'crt-cmd-no-hamali-wheat-s', commodityId: 'cmd-no-hamali-wheat', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-no-hamali-wheat-m', commodityId: 'cmd-no-hamali-wheat', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
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
        isRepackSelected: true,
        repackedSmallBags: 30,
        repackedBigBags: 20,
        remarks: 'Repacked 50 bags into 30S and 20B',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Repacking hamali = 50 moved bags * 4/bag = 200.
    // Under independent billing, source pending obligation (1200) remains separate on source bill.
    // Target storage rent = 2000 initial (repacking hamali decoupled per SSOT).
    expect(res.body.targetGrn.rentAmount).toBe(2000);
    expect(res.body.movement.hamaliCharge).toBe(200);
    expect(res.body.movement.hamaliBags).toBe(50);
    expect(res.body.movement.hamaliRate).toBe(4);
    expect(res.body.movement.financialSnapshot.hamaliAmount).toBe(200);
    expect(res.body.targetGrn.remarks).toContain('Repacking Hamali: ₹200 (50 bags @ ₹4/bag)');
  });

  it('charges zero repacking hamali when lot composition is confirmed but repacking is not explicitly selected', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40,
      bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0307',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20,
      bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0308',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        isRepackSelected: false,
        repackedSmallBags: 30,
        repackedBigBags: 20,
        remarks: 'Confirmed mix without repacking',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetGrn.rentAmount).toBe(2000); // 0 repacking hamali, strictly target's own
    expect(res.body.movement.hamaliCharge ?? 0).toBe(0);
    expect(res.body.targetGrn.remarks).not.toContain('Repacking Hamali');
  });

  it('charges repacking hamali strictly based on actual number of bags handled', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40,
      bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0309',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Trader Vikas', commodityId: hamaliCommodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20,
      bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0310',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        isRepackSelected: true,
        repackedBagCount: 20,
        repackedSmallBags: 30,
        repackedBigBags: 20,
        remarks: 'Explicitly repacked 20 bags',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 20 bags * 4 = 80 hamali. Target storage rent = 2000 (repacking hamali decoupled per SSOT).
    expect(res.body.targetGrn.rentAmount).toBe(2000);
    expect(res.body.movement.hamaliCharge).toBe(80);
    expect(res.body.movement.hamaliBags).toBe(20);
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
    // Under independent billing, source pending obligation (1200) remains separate on source bill.
    // Target rent = 2000 initial + 0 repacking = 2000.
    expect(res.body.targetGrn.rentAmount).toBe(2000);
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
    expect(res.body.targetGrn.rentAmount).toBe(2000);
    expect(res.body.movement.hamaliCharge ?? 0).toBe(0);
    expect('hamaliCharge' in res.body.movement).toBe(false);
  });
});
