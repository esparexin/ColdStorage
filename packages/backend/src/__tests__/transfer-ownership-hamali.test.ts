import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
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
const facilityId = 'fac-transfer-hamali';

/**
 * D3 regression: ownership-transfer settlement must include the first-season
 * hamali share, like the rent-gate, payment collector and rent summary do.
 * 100 bags, stored rent 5000, hamali snapshot 400 -> total due 5400.
 */
describe('Transfer Ownership: first-season hamali settlement (D3)', () => {
  let adminToken: string;
  let customerA: string;
  let customerB: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-transfer-hamali-admin',
      username: 'transfer.hamali.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-hamali-potato');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'TRH', name: 'Transfer Hamali Facility' });

    customerA = await seedCustomer({ id: 'cust-trh-a', facilityId, name: 'Farmer Ramesh' });
    customerB = await seedCustomer({ id: 'cust-trh-b', facilityId, name: 'Trader Suresh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-hamali-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isHamaliApplicable: true,
      hamaliRate: 4,
      isActive: true,
    });
    commodityId = cmd.id;
  });

  it('blocks transfer until stored rent plus hamali snapshot is settled', async () => {
    const seasonalGrn = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 5000,
      grnNumber: 'GRN-26-27-0094',
    });
    // Inward hamali snapshot: 100 bags x Rs 4, as create-grn persists it.
    await GrnModel.updateOne(
      { id: seasonalGrn },
      { $set: { hamaliRate: 4, hamaliAmount: 400 } },
    );

    // 1. Settling only the stored rent (5000) must still be rejected: 400 hamali remains.
    const shortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer hamali lot, short settlement',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: {
          amountPaid: 5000,
          paymentMode: 'Cash',
          paymentNotes: 'Stored rent only',
        },
      });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error).toContain('must be fully settled before transfer');

    // 2. Full settlement of 5400 (5000 rent + 400 hamali) succeeds atomically.
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer hamali lot with full settlement',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: {
          amountPaid: 5400,
          paymentMode: 'Cash',
          paymentNotes: 'Rent plus hamali settled at transfer',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.amountPaid).toBe(5400);
    expect(res.body.movement.financialSnapshot.rentAmount).toBe(5400);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(0);
    expect(res.body.movement.financialSnapshot.paymentStatus).toBe('Settled');

    const updated = await GrnModel.findOne({ id: seasonalGrn }).lean().exec();
    expect(updated?.customerId).toBe(customerB);
  });

  it('permits transfer under AGREED_PENDING with unpaid dues, carrying forward liability to transferee', async () => {
    const seasonalGrn = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      rentAmount: 5000, grnNumber: 'GRN-26-27-0095',
    });
    await GrnModel.updateOne({ id: seasonalGrn }, { $set: { hamaliRate: 4, hamaliAmount: 400 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer with agreed pending carry forward',
        paymentDecision: 'AGREED_PENDING',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeUndefined();
    expect(res.body.movement.financialSnapshot.rentAmount).toBe(5400);
    expect(res.body.movement.financialSnapshot.totalPaid).toBe(0);
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(5400);
    expect(res.body.movement.financialSnapshot.paymentStatus).toBe('Not Settled');
    expect(res.body.movement.financialSnapshot.rentState).toBe('PENDING');

    const updated = await GrnModel.findOne({ id: seasonalGrn }).lean().exec();
    expect(updated?.customerId).toBe(customerB);
    expect(updated?.remarks).toContain('carried forward under agreed pending terms');

    // Transferee (Customer B) subsequently settles the carried-forward balance
    const payRes = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        amountPaid: 5400,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.summary.remainingBalance).toBe(0);
    expect(payRes.body.summary.paymentStatus).toBe('Settled');
  });

  it('rejects SETTLE_NOW when payment amount exceeds remaining balance', async () => {
    const seasonalGrn = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      rentAmount: 5000, grnNumber: 'GRN-26-27-0096',
    });
    await GrnModel.updateOne({ id: seasonalGrn }, { $set: { hamaliRate: 4, hamaliAmount: 400 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer with overpayment attempt',
        paymentDecision: 'SETTLE_NOW',
        settlementDetails: { amountPaid: 6000, paymentMode: 'Cash' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exceeds remaining rent balance');
  });

  it('rejects SETTLE_NOW when settlementDetails are missing', async () => {
    const seasonalGrn = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      rentAmount: 5000, grnNumber: 'GRN-26-27-0097',
    });
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer missing settlementDetails',
        paymentDecision: 'SETTLE_NOW',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('must be fully settled before transfer under SETTLE_NOW');
  });

  it('permits transfer when remaining balance is zero without requiring settlement', async () => {
    const seasonalGrn = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      rentAmount: 5000, grnNumber: 'GRN-26-27-0098',
    });
    await mongoose.connection.collection('rentpayments').insertOne({
      id: 'rp-test-zero', facilityId, grnId: seasonalGrn, grnNumber: 'GRN-26-27-0098',
      receiptNumber: 'RRCPT-26-27-0098', amountPaid: 5400, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'test-admin',
    });
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: seasonalGrn,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Transfer zero balance lot',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeUndefined();
    expect(res.body.movement.financialSnapshot.remainingBalance).toBe(0);
  });
});
