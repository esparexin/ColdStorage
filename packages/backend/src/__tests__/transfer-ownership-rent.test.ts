import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-transfer-rent';

describe('Transfer Ownership: Monthly & Seasonal Rent Accrual (Phase 2)', () => {
  let adminToken: string;
  let customerA: string;
  let customerB: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-transfer-admin',
      username: 'transfer.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'TRF', name: 'Transfer Rent Facility' });

    customerA = await seedCustomer({ id: 'cust-trf-a', facilityId, name: 'Farmer Ramesh' });
    customerB = await seedCustomer({ id: 'cust-trf-b', facilityId, name: 'Trader Suresh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-wheat',
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
    });
    commodityId = cmd.id;
  });

  it('monthly lot accrues rent up to transfer date based on elapsed cycles', async () => {
    // Inward 60 days ago: 100 bags @ ₹10/bag/month
    const inwardDate = new Date();
    inwardDate.setDate(inwardDate.getDate() - 65);

    const monthlyGrn = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Wheat',
      chamber: 'CH-01',
      bags: 100,
      rentType: 'Monthly',
      rentAmount: 0,
      date: inwardDate,
      grnNumber: 'GRN-26-27-0091',
    });
    await GrnModel.updateOne({ id: monthlyGrn }, { $set: { bagPrice: 10 } });

    const transferDate = new Date();
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: monthlyGrn,
        newCustomerId: customerB,
        movementDate: transferDate,
        remarks: 'Transfer monthly lot with accrued rent',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.grn.customerId).toBe(customerB);

    // 65 days elapsed = 3 cycles (day 0, day 31, day 62) => 100 bags × ₹10 = ₹1000/cycle => ₹3000
    expect(res.body.movement.financialSnapshot.rentAmount).toBeGreaterThan(0);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBeGreaterThan(0);
    expect(res.body.movement.financialSnapshot.rentState).toBe('PENDING');

    const updated = await GrnModel.findOne({ id: monthlyGrn }).lean().exec();
    expect(updated?.customerId).toBe(customerB);
    expect(updated?.rentAmount).toBe(res.body.movement.financialSnapshot.rentAmount);
    expect(updated?.remarks).toContain('Pending rent: ₹3000 of ₹3000');
    expect(updated?.remarks).toContain('Transferee agreed to assume pending balance');
  });

  it('seasonal lot preserves agreed seasonal contract amount during transfer', async () => {
    const seasonalGrn = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Wheat',
      chamber: 'CH-01',
      bags: 200,
      rentType: 'Seasonal',
      rentAmount: 3000,
      grnNumber: 'GRN-26-27-0092',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer seasonal lot to new owner',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.movement.financialSnapshot.rentAmount).toBe(3000);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(3000);
    expect(res.body.movement.financialSnapshot.rentState).toBe('PENDING');

    const updated = await GrnModel.findOne({ id: seasonalGrn }).lean().exec();
    expect(updated?.rentAmount).toBe(3000);
  });

  it('settles outstanding rent during ownership transfer with receipt generation (SETTLE_NOW)', async () => {
    const seasonalGrn = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Wheat',
      chamber: 'CH-01',
      bags: 100,
      rentType: 'Seasonal',
      rentAmount: 2500,
      grnNumber: 'GRN-26-27-0093',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer lot with full rent settlement',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: {
          amountPaid: 2500,
          paymentMode: 'Cash',
          paymentNotes: 'Settled by seller before transfer',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.amountPaid).toBe(2500);
    expect(res.body.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(0);
    expect(res.body.movement.financialSnapshot.paymentStatus).toBe('Settled');
    expect(res.body.movement.financialSnapshot.rentState).toBe('SETTLED');

    const updated = await GrnModel.findOne({ id: seasonalGrn }).lean().exec();
    expect(updated?.customerId).toBe(customerB);
    expect(updated?.remarks).toContain('Settled at transfer: ₹2500');
    expect(updated?.remarks).toContain(res.body.payment.receiptNumber);
  });
});
