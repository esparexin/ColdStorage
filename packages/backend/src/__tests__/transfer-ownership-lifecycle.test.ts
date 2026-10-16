import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-transfer-life';

describe('Transfer Ownership: Paid & Unpaid Lifecycle & Subsequent Delivery', () => {
  let adminToken: string;
  let customerA: string;
  let customerB: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-life-admin',
      username: 'life.admin',
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
    await seedFacility({ id: facilityId, code: 'TRL', name: 'Transfer Lifecycle Facility' });

    customerA = await seedCustomer({ id: 'cust-life-a', facilityId, name: 'Farmer Ramesh' });
    customerB = await seedCustomer({ id: 'cust-life-b', facilityId, name: 'Trader Suresh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-wheat-life',
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
    });
    commodityId = cmd.id;
  });

  it('paid lot transfers with 0 balance, no duplicate receipt, and delivers without duplicate rent collection', async () => {
    const grnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Wheat', chamber: 'CH-01', bags: 100,
      rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0101',
    });
    await GrnModel.updateOne({ id: grnId }, { $set: { bagPrice: 30 } });

    // Customer A has already paid ₹3,000 prior to transfer
    await RentPaymentModel.create({
      id: 'rp-prior-settled', facilityId, grnId, grnNumber: 'GRN-26-27-0101',
      receiptNumber: 'RRCPT-26-27-0001', amountPaid: 3000, paymentMode: 'Cash',
      paymentDate: new Date(), notes: 'Prior settlement by Ramesh', createdBy: 'usr-life-admin',
    });

    // 1. Transfer to Customer B without payment collection
    const trRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, newCustomerId: customerB, movementDate: new Date(),
        remarks: 'Transfer pre-settled lot to Suresh',
      });

    expect(trRes.status).toBe(200);
    expect(trRes.body.payment).toBeUndefined(); // No duplicate receipt
    expect(trRes.body.movement.financialSnapshot.totalPaid).toBe(3000);
    expect(trRes.body.movement.financialSnapshot.remainingBalance).toBe(0);
    expect(trRes.body.movement.financialSnapshot.paymentStatus).toBe('Settled');

    // 2. Subsequent outward delivery for Customer B
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, smallBags: 100, bigBags: 0 });

    expect(delRes.status).toBe(201);
    expect(delRes.body.summary.remainingDeliveryBalance).toBe(0);
    expect(delRes.body.summary.grnStatus).toBe('CLOSED');

    // Verify payments collection still has exactly 1 receipt (no duplicate collected)
    const paymentCount = await RentPaymentModel.countDocuments({ facilityId, grnId });
    expect(paymentCount).toBe(1);
  });

  it('unpaid lot transfers under AGREED_PENDING, preserves liability, and keeps GRN OPEN until settled', async () => {
    const grnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh',
      commodityId, commodityName: 'Wheat', chamber: 'CH-01', bags: 100,
      rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0102',
    });
    await GrnModel.updateOne({ id: grnId }, { $set: { bagPrice: 30 } });

    // 1. Transfer to Customer B under AGREED_PENDING
    const trRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, newCustomerId: customerB, movementDate: new Date(),
        remarks: 'Transfer lot with pending dues carried forward',
        paymentDecision: 'AGREED_PENDING',
      });

    expect(trRes.status).toBe(200);
    expect(trRes.body.payment).toBeUndefined();
    expect(trRes.body.movement.financialSnapshot.totalPaid).toBe(0);
    expect(trRes.body.movement.financialSnapshot.remainingBalance).toBe(3000);
    expect(trRes.body.movement.financialSnapshot.paymentStatus).toBe('Not Settled');

    const grnAfterTransfer = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grnAfterTransfer?.customerId).toBe(customerB);
    expect(grnAfterTransfer?.rentAmount).toBe(3000);

    // 2. Outward delivery of all bags without inline payment keeps GRN OPEN
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, smallBags: 100, bigBags: 0, paymentAmount: 0 });

    expect(delRes.status).toBe(201);
    expect(delRes.body.summary.remainingDeliveryBalance).toBe(0);
    // Closure invariant: GRN remains OPEN because ₹3,000 rent is still unpaid
    expect(delRes.body.summary.grnStatus).toBe('OPEN');

    // 3. Customer B settles pending rent
    const payRes = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId, amountPaid: 3000, paymentMode: 'UPI',
        paymentDate: new Date(), notes: 'Customer B settles outstanding rent',
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.payment.amountPaid).toBe(3000);
  });
});
