import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-rent';

describe('Merge GRN: Rent Carry-Forward & Obligation Preservation (Phase 4)', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-admin',
      username: 'merge.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-wheat-mrg');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MRG', name: 'Merge Rent Facility' });
    customerA = await seedCustomer({ id: 'cust-mrg-a', facilityId, name: 'Farmer Ramesh' });
    const cmd = await CommodityModel.create({ id: 'cmd-wheat-mrg', name: 'Wheat', normalizedName: 'wheat', isActive: true });
    commodityId = cmd.id;
  });

  it('carries forward outstanding pending rent into target GRN when source has partial payments', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0101',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 50, rentType: 'Seasonal', rentAmount: 1500, grnNumber: 'GRN-26-27-0102',
    });

    await RentPaymentModel.create({
      id: 'rp-src-01', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-26-27-0102',
      receiptNumber: 'RCPT-SRC-01', amountPaid: 500, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'usr-merge-admin',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Merge lot 102 into 101',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 2000 initial + 1000 pending = 3000
    expect(res.body.targetGrn.rentAmount).toBe(3000);
    expect(res.body.targetGrn.bags).toBe(150);
    expect(res.body.movement.financialSnapshot.rentAmount).toBe(3000);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(3000);
    expect(res.body.movement.financialSnapshot.rentState).toBe('PENDING');

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('Financial record preserved: Rent Obligation ₹1500, Paid ₹500, Pending ₹1000');
    const sourcePayments = await RentPaymentModel.find({ grnId: sourceGrnId }).lean().exec();
    expect(sourcePayments.length).toBe(1);
    expect(sourcePayments[0].amountPaid).toBe(500);

    const updatedTarget = await GrnModel.findOne({ id: targetGrnId }).lean().exec();
    expect(updatedTarget?.rentAmount).toBe(3000);
    expect(updatedTarget?.remarks).toContain('Carried pending rent: ₹1000');
  });

  it('monthly unbilled source lot accrues occupancy rent and carries it forward to target', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Monthly', rentAmount: 1000, grnNumber: 'GRN-26-27-0103',
    });

    const inwardDate = new Date();
    inwardDate.setDate(inwardDate.getDate() - 65);

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Monthly', rentAmount: 0, date: inwardDate, grnNumber: 'GRN-26-27-0104',
    });
    await GrnModel.updateOne({ id: sourceGrnId }, { $set: { bagPrice: 10 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Merge unbilled monthly lot',
      });

    expect(res.status).toBe(200);
    // 3 billing cycles elapsed = 100 * 10 * 3 = 3000 accrued on source
    // Target rentAmount = 1000 + 3000 = 4000
    expect(res.body.targetGrn.rentAmount).toBe(4000);
    expect(res.body.movement.financialSnapshot.rentAmount).toBe(4000);

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.rentAmount).toBe(3000);
  });

  it('merges multiple source lots carrying forward cumulative pending dues', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 50, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0105',
    });

    // Source 1: Fully paid (rent 800, paid 800 -> pending 0)
    const src1 = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 30, rentType: 'Seasonal', rentAmount: 800, grnNumber: 'GRN-26-27-0106',
    });
    await RentPaymentModel.create({
      id: 'rp-src-06', facilityId, grnId: src1, grnNumber: 'GRN-26-27-0106',
      receiptNumber: 'RCPT-SRC-06', amountPaid: 800, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'usr-merge-admin',
    });

    // Source 2: Unpaid (rent 1200, paid 0 -> pending 1200)
    const src2 = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 40, rentType: 'Seasonal', rentAmount: 1200, grnNumber: 'GRN-26-27-0107',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [src1, src2],
        movementDate: new Date(),
        remarks: 'Merge multiple lots into 105',
      });

    expect(res.status).toBe(200);
    // Target 1000 + 0 + 1200 = 2200
    expect(res.body.targetGrn.rentAmount).toBe(2200);
    expect(res.body.targetGrn.bags).toBe(120);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(2200);
  });

  it('merges source lot with confirmed repacked small and big bag counts and rejects mismatches', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S+B', smallBags: 40, bigBags: 60, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0108',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 50, bagType: 'S+B', smallBags: 20, bigBags: 30, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0109',
    });

    // 1. Mismatch rejection: 35 + 20 = 55 !== 50
    const mismatchRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        repackedSmallBags: 35,
        repackedBigBags: 20,
        remarks: 'Mismatched repacking counts',
      });

    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.body.error).toContain('must reconcile with total moved stock');

    // 2. Valid repacking: 35 + 15 = 50
    const validRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        repackedSmallBags: 35,
        repackedBigBags: 15,
        remarks: 'Re-bagged into 35 small and 15 big',
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.targetGrn.bags).toBe(150);
    expect(validRes.body.targetGrn.smallBags).toBe(75); // 40 + 35
    expect(validRes.body.movement.smallBagsMoved).toBe(35);
    expect(validRes.body.movement.bigBagsMoved).toBe(15);
  });
});
