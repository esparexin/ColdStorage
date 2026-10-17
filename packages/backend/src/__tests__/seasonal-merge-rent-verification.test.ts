import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { useHistoricalTestingDates } from './helpers/historical-dates-env.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-seasonal-verif';

describe('Seasonal Merge, Rent Verification & Inline Settlement Tests', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  useHistoricalTestingDates();

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-verif-admin',
      username: 'verif.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-mirchi-verif-s', commodityId: 'cmd-mirchi-verif', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-mirchi-verif-m', commodityId: 'cmd-mirchi-verif', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'SVF', name: 'Seasonal Verif Facility' });
    customerId = await seedCustomer({ id: 'cust-verif-1', facilityId, name: 'Farmer Rama' });
    const cmd = await CommodityModel.create({ id: 'cmd-mirchi-verif', name: 'Mirchi', normalizedName: 'mirchi', isActive: true });
    commodityId = cmd.id;
  });

  it('marks historical rent as PENDING_VERIFICATION when differential rates exist and composition is unconfirmed', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1A', bags: 200, rentType: 'Seasonal', rentAmount: 0, grnNumber: 'GRN-26-27-0201',
    });
    // Differential rates without confirmed split
    await GrnModel.updateOne(
      { id: grnId },
      { $set: { smallBagPrice: 150, bigBagPrice: 210, bagType: 'S+B', smallBags: 0, bigBags: 0 } },
    );

    const res = await request(app)
      .get(`/api/facilities/${facilityId}/rent/grn/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rentState).toBe('PENDING_VERIFICATION');
    expect(res.body.verificationReason).toContain('Small and big bag composition unverified');
    expect(res.body.rentAmount).toBe(0); // Zero fabricated bill
  });

  it('preserves existing rent bills and payments without recalculating previously billed periods', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1A', bags: 100, rentType: 'Seasonal', rentAmount: 12000, grnNumber: 'GRN-26-27-0202',
    });
    await RentPaymentModel.create({
      id: 'rp-hist-01', facilityId, grnId, grnNumber: 'GRN-26-27-0202',
      receiptNumber: 'RRCPT-26-27-0099', amountPaid: 4000, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'usr-verif-admin',
    });

    const res = await request(app)
      .get(`/api/facilities/${facilityId}/rent/grn/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rentAmount).toBe(12000);
    expect(res.body.totalPaid).toBe(4000);
    expect(res.body.remainingBalance).toBe(8000);
    expect(res.body.rentState).toBe('PENDING');
  });

  it('Scenario B: allows inline partial source payment during previous season merge and preserves liability', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1A', bags: 200, rentType: 'Seasonal', rentAmount: 20000, grnNumber: 'GRN-26-27-0203',
      date: new Date('2026-04-10'),
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1B', bags: 100, rentType: 'Seasonal', rentAmount: 12000, grnNumber: 'GRN-24-25-0100',
      date: new Date('2024-05-15'),
    });
    await RentPaymentModel.create({
      id: 'rp-src-prev', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-24-25-0100',
      receiptNumber: 'RRCPT-24-25-0001', amountPaid: 4000, paymentMode: 'Cash',
      paymentDate: new Date('2024-06-01'), createdBy: 'usr-verif-admin',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-05-01'),
        remarks: 'Previous season lot consolidation',
        sourcePaymentAmount: 3000,
        sourcePaymentMode: 'Cash',
        repackedSmallBags: 60,
        repackedBigBags: 40,
        referenceWeight: 5000,
      });

    expect(res.status).toBe(200);
    expect(res.body.targetGrn.bags).toBe(300);
    expect(res.body.targetGrn.rentAmount).toBe(25000); // Target's own bill + carried pending rent = 25000

    const sourcePayments = await RentPaymentModel.find({ grnId: sourceGrnId }).sort({ createdAt: 1 });
    expect(sourcePayments.length).toBe(2);
    expect(sourcePayments[1].amountPaid).toBe(3000);

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('Paid ₹7000');
    expect(updatedSource?.remarks).toContain('Pending ₹5000');
  });

  it('rejects invalid small/big counts for 300-bag lot, accepts reconciled total, and rejects duplicate retry', async () => {
    const targetId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1A', bags: 100, rentType: 'Seasonal', rentAmount: 10000, grnNumber: 'GRN-26-27-0301',
    });
    const sourceId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1B', bags: 300, rentType: 'Seasonal', rentAmount: 30000, grnNumber: 'GRN-26-27-0302',
    });
    // Configure differential rates on target
    await GrnModel.updateOne({ id: targetId }, { $set: { smallBagPrice: 150, bigBagPrice: 210 } });

    // 1. Rejects when counts exceed total (350 > 300)
    const resOver = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetGrnId: targetId, sourceGrnIds: [sourceId], remarks: 'Reconcile test', repackedSmallBags: 350, repackedBigBags: 0 });
    expect(resOver.status).toBe(400);
    expect(resOver.body.error).toContain('can exceed total moved stock');

    // 2. Rejects when counts do not sum to total (180 + 150 = 330 !== 300)
    const resMismatch = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetGrnId: targetId, sourceGrnIds: [sourceId], remarks: 'Reconcile test', repackedSmallBags: 180, repackedBigBags: 150 });
    expect(resMismatch.status).toBe(400);
    expect(resMismatch.body.error).toContain('must reconcile with total moved stock of 300 bags');

    // 3. Accepts reconciled counts (200 + 100 = 300)
    const resOk = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetGrnId: targetId, sourceGrnIds: [sourceId], remarks: 'Reconcile test', repackedSmallBags: 200, repackedBigBags: 100 });
    expect(resOk.status).toBe(200);
    expect(resOk.body.targetGrn.bags).toBe(400); // 100 initial + 300 moved

    // 4. Retrying the merge must be rejected and not duplicate stock
    const resRetry = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetGrnId: targetId, sourceGrnIds: [sourceId], remarks: 'Retry merge', repackedSmallBags: 200, repackedBigBags: 100 });
    expect(resRetry.status).toBe(400);
    expect(resRetry.body.error).toContain('is already CLOSED');

    // Destination bags remain exactly 400
    const targetAfter = await GrnModel.findOne({ id: targetId }).lean();
    expect(targetAfter?.bags).toBe(400);
  });

  it('Scenario C & D: Outward with inline payment collection retains balance and keeps GRN OPEN if rent remains', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Rama', commodityId, commodityName: 'Mirchi',
      chamber: '1A', bags: 100, bagType: 'S+B', smallBags: 50, bigBags: 50, rentType: 'Seasonal', rentAmount: 7000, grnNumber: 'GRN-26-27-0204',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        smallBags: 50,
        bigBags: 50,
        paymentAmount: 3000,
        paymentMode: 'Cash',
        paymentReference: 'Partial outward cash memo',
      });

    expect(res.status).toBe(201);
    expect(res.body.delivery.totalBags).toBe(100);

    const grnAfterDelivery = await GrnModel.findOne({ id: grnId }).lean();
    expect(grnAfterDelivery?.status).toBe('OPEN');

    const payments = await RentPaymentModel.find({ grnId });
    expect(payments.length).toBe(1);
    expect(payments[0].amountPaid).toBe(3000);
  });
});
