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
});
