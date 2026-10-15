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
const facilityId = 'fac-merge-overpay';

describe('GRN Merge Pre-Settlement Overpayment Guard', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;
  let targetId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-overpay',
      username: 'merge.overpay',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MOP', name: 'Merge Overpay Facility' });
    customerA = await seedCustomer({ id: 'cust-mop', facilityId, name: 'Farmer Overpay Test' });
    const cmd = await CommodityModel.create({
      id: 'cmd-mop-onion',
      name: 'Onion',
      normalizedName: 'onion',
      isActive: true,
      defaultBagType: 'S',
    });
    commodityId = cmd.id;
    targetId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Overpay Test',
      commodityId,
      commodityName: 'Onion',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S',
      rentAmount: 1000,
      grnNumber: 'GRN-MOP-TARGET',
    });
  });

  it('rejects merge when sourcePaymentAmount exceeds remaining rent balance', async () => {
    // Source GRN has 40 bags, rentAmount ₹400
    const sourceId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Overpay Test',
      commodityId,
      commodityName: 'Onion',
      chamber: 'CH-01',
      bags: 40,
      bagType: 'S',
      rentAmount: 400,
      grnNumber: 'GRN-MOP-SRC-01',
    });

    // Attempt merge with sourcePaymentAmount = 500 (exceeds remaining balance of ₹400)
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [sourceId],
        movementDate: new Date(),
        sourcePaymentAmount: 500,
        sourcePaymentMode: 'Cash',
        remarks: 'Overpayment test merge',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds remaining rent balance of ₹400/);

    // Verify atomicity: no payment was recorded and source GRN remains OPEN
    const payments = await RentPaymentModel.find({ facilityId, grnId: sourceId }).lean();
    expect(payments).toHaveLength(0);

    const sourceGrn = await GrnModel.findOne({ id: sourceId }).lean();
    expect(sourceGrn?.status).toBe('OPEN');
  });

  it('accepts exact source pre-settlement payment during merge and updates financial records', async () => {
    // Source GRN has 50 bags, rentAmount ₹500
    const sourceId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Overpay Test',
      commodityId,
      commodityName: 'Onion',
      chamber: 'CH-01',
      bags: 50,
      bagType: 'S',
      rentAmount: 500,
      grnNumber: 'GRN-MOP-SRC-02',
    });

    // Merge with exact sourcePaymentAmount = 500
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [sourceId],
        movementDate: new Date(),
        sourcePaymentAmount: 500,
        sourcePaymentMode: 'Cash',
        remarks: 'Exact pre-settlement merge',
      });

    expect(res.status).toBe(200);

    // Verify payment was recorded
    const payments = await RentPaymentModel.find({ facilityId, grnId: sourceId }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0].amountPaid).toBe(500);

    // Verify source GRN is CLOSED with settled status
    const sourceGrn = await GrnModel.findOne({ id: sourceId }).lean();
    expect(sourceGrn?.status).toBe('CLOSED');
    expect(sourceGrn?.remarks).toContain('Status: Settled');
  });
});
