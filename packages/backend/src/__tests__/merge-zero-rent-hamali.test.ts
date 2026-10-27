import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-zero-rent-merge';

describe('Zero-Rent Source GRN Hamali Assessment during Merge (Phase 2: Finding 6)', () => {
  let adminToken: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-zero-merge-admin',
      username: 'zero.merge.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'ZMRG', name: 'Zero Rent Merge Facility' });
    customerId = await seedCustomer({ id: 'cust-zmrg-1', facilityId, name: 'Farmer Ramesh' });
  });

  it('assesses outstanding Hamali on zero-rent source GRN during merge', async () => {
    const cmd = await CommodityModel.create({
      id: 'cmd-wheat-zero-rent', name: 'Zero Rent Wheat', normalizedName: 'zero rent wheat',
      isHamaliApplicable: true, hamaliRate: 5, isActive: true,
    });
    await seedControllerRates(cmd.id, { small: 0, big: 0 }, { small: 0, big: 0 });

    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Zero Rent Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Seasonal', rentAmount: 2000, grnNumber: 'GRN-26-27-0201',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Zero Rent Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Seasonal', rentAmount: 0, grnNumber: 'GRN-26-27-0202',
    });
    await GrnModel.updateOne({ id: sourceGrnId }, { $set: { hamaliRate: 5, hamaliAmount: 500 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId],
        movementDate: new Date(), remarks: 'Merge zero-rent source lot with hamali',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('Rent Obligation ₹0, Paid ₹0, Pending ₹500');

    const updatedTarget = await GrnModel.findOne({ id: targetGrnId }).lean().exec();
    expect(updatedTarget?.rentAmount).toBe(2000);
  });

  it('settles zero-rent source GRN Hamali when paid in full before merge', async () => {
    const cmd = await CommodityModel.create({
      id: 'cmd-wheat-settled', name: 'Settled Wheat', normalizedName: 'settled wheat',
      isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
    await seedControllerRates(cmd.id, { small: 0, big: 0 }, { small: 0, big: 0 });

    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Settled Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0203',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Settled Wheat',
      chamber: 'CH-01', bags: 100, rentType: 'Seasonal', rentAmount: 0, grnNumber: 'GRN-26-27-0204',
    });
    await GrnModel.updateOne({ id: sourceGrnId }, { $set: { hamaliRate: 4, hamaliAmount: 400 } });

    await RentPaymentModel.create({
      id: 'rp-settled-01', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-26-27-0204',
      receiptNumber: 'RCPT-SETTLED-01', amountPaid: 400, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'usr-zero-merge-admin',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId],
        movementDate: new Date(), remarks: 'Merge fully settled zero-rent source lot',
      });

    expect(res.status).toBe(200);
    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('Rent Obligation ₹0, Paid ₹400, Pending ₹0 (Status: Settled)');
  });

  it('does not assess Hamali on zero-rent source GRN when Hamali is disabled', async () => {
    const cmd = await CommodityModel.create({
      id: 'cmd-disabled-merge', name: 'Disabled Merge Crop', normalizedName: 'disabled merge crop',
      isHamaliApplicable: false, hamaliRate: 0, isActive: true,
    });
    await seedControllerRates(cmd.id, { small: 0, big: 0 }, { small: 0, big: 0 });

    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Disabled Merge Crop',
      chamber: 'CH-01', bags: 50, rentType: 'Seasonal', rentAmount: 1000, grnNumber: 'GRN-26-27-0205',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId: cmd.id, commodityName: 'Disabled Merge Crop',
      chamber: 'CH-01', bags: 50, rentType: 'Seasonal', rentAmount: 0, grnNumber: 'GRN-26-27-0206',
    });
    await GrnModel.updateOne({ id: sourceGrnId }, { $set: { hamaliRate: 0, hamaliAmount: 0 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId, sourceGrnIds: [sourceGrnId],
        movementDate: new Date(), remarks: 'Merge disabled hamali source lot',
      });

    expect(res.status).toBe(200);
    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('Rent Obligation ₹0, Paid ₹0, Pending ₹0 (Status: Settled)');
  });
});
