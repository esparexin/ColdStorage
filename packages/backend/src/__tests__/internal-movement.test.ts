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
import { deliveryService } from '../modules/delivery/delivery.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-mov-test';

describe('Internal Movement Workflows (Merge & Transfer Ownership)', () => {
  let adminToken: string;
  let customerA: string;
  let customerB: string;
  let commodityId: string;
  let grn38: string;
  let grn39: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-mov-admin',
      username: 'mov.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MOV', name: 'Movement Facility' });

    customerA = await seedCustomer({ id: 'cust-a', facilityId, name: 'Farmer Ramesh' });
    customerB = await seedCustomer({ id: 'cust-b', facilityId, name: 'Trader Suresh' });

    const cmd = await CommodityModel.create({
      id: 'cmd-tamarind',
      name: 'Tamarind',
      normalizedName: 'tamarind',
      isActive: true,
    });
    commodityId = cmd.id;

    grn38 = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Farmer Ramesh',
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 100,
      rentAmount: 2000,
      grnNumber: 'GRN-26-27-0038',
    });

    grn39 = await seedGrn({
      facilityId,
      customerId: customerA,
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 50,
      rentAmount: 1000,
      grnNumber: 'GRN-26-27-0039',
    });
  });

  it('executes merge with unsettled rent on source GRN, preserving complete financial audit record', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: grn38,
        sourceGrnIds: [grn39],
        movementDate: new Date(),
        remarks: 'Merge source with unsettled rent',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetGrn.bags).toBe(150);

    const updatedSource = await GrnModel.findOne({ id: grn39 }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.mergedIntoGrnId).toBe(grn38);
    expect(updatedSource?.mergedIntoGrnNumber).toBe('GRN-26-27-0038');
    expect(updatedSource?.rentAmount).toBe(1000);
    expect(updatedSource?.remarks).toContain('Financial record preserved: Rent Obligation ₹1000, Paid ₹0, Pending ₹1000 (Status: Not Settled)');

    const updatedTarget = await GrnModel.findOne({ id: grn38 }).lean().exec();
    expect(updatedTarget?.remarks).toContain('Rent: ₹1000, Paid: ₹0, Balance: ₹1000, Status: Not Settled');
  });

  it('rejects merge if source or target GRN has active loan hold', async () => {
    await GrnModel.updateOne({ id: grn39 }, { $set: { loanStatus: 'TAKEN' } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: grn38,
        sourceGrnIds: [grn39],
        movementDate: new Date(),
        remarks: 'Testing loan hold block',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active loan hold');
  });

  it('executes merge: clears source GRN, increments target GRN, preserves history', async () => {
    await RentPaymentModel.create({
      id: 'rp-39',
      facilityId,
      grnId: grn39,
      grnNumber: 'GRN-26-27-0039',
      receiptNumber: 'RCPT-39',
      amountPaid: 1000,
      paymentMode: 'Cash',
      paymentDate: new Date(),
      createdBy: 'usr-mov-admin',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: grn38,
        sourceGrnIds: [grn39],
        movementDate: new Date(),
        additionalRentAmount: 500,
        remarks: 'Re-bagged and merged lot 39 into 38',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetGrn.bags).toBe(150);
    expect(res.body.targetGrn.rentAmount).toBe(2500);

    const updatedSource = await GrnModel.findOne({ id: grn39 }).lean().exec();
    expect(updatedSource?.status).toBe('CLOSED');
    expect(updatedSource?.remarks).toContain('MERGED into GRN GRN-26-27-0038');

    const updatedTarget = await GrnModel.findOne({ id: grn38 }).lean().exec();
    expect(updatedTarget?.remarks).toContain('MERGE RECEIVED');
    expect(updatedTarget?.remarks).toContain('GRN-26-27-0039');

    const histRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grn38}/movement-history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(histRes.status).toBe(200);
    const mergeInEntry = histRes.body.history.entries.find(
      (e: { type: string }) => e.type === 'INTERNAL_MERGE_IN',
    );
    expect(mergeInEntry).toBeDefined();
    expect(mergeInEntry.receivedBags).toBe(50);
  });

  it('transfers ownership: preserves financial state and updates customer', async () => {
    await RentPaymentModel.create({
      id: 'rp-38',
      facilityId,
      grnId: grn38,
      grnNumber: 'GRN-26-27-0038',
      receiptNumber: 'RCPT-38',
      amountPaid: 800,
      paymentMode: 'UPI',
      paymentDate: new Date(),
      createdBy: 'usr-mov-admin',
    });

    await deliveryService.createDelivery(
      facilityId,
      { grnId: grn38, smallBags: 20, bigBags: 0 },
      'usr-mov-admin',
    );

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: grn38,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Sold in-chamber lot to Suresh',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.grn.customerId).toBe(customerB);
    expect(res.body.grn.customerName).toBe('Trader Suresh');
    expect(res.body.grn.bags).toBe(100);
    expect(res.body.movement.totalBagsMoved).toBe(80);
    expect(res.body.movement.smallBagsMoved).toBe(80);
    expect(res.body.movement.bigBagsMoved).toBe(0);

    const updated = await GrnModel.findOne({ id: grn38 }).lean().exec();
    expect(updated?.customerId).toBe(customerB);
    expect(updated?.remarks).toContain('OWNERSHIP TRANSFERRED');
    expect(updated?.remarks).toContain('Pending rent: ₹1200 of ₹2000');
    expect(updated?.remarks).toContain('Farmer Ramesh');
    expect(updated?.remarks).toContain('Trader Suresh');

    const histRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grn38}/movement-history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(histRes.status).toBe(200);
    const transferEntry = histRes.body.history.entries.find(
      (e: { type: string }) => e.type === 'OWNERSHIP_TRANSFER',
    );
    expect(transferEntry).toBeDefined();
    expect(transferEntry.remarks).toContain('Trader Suresh');
  });

  it('rejects ownership transfer if active loan hold exists', async () => {
    await GrnModel.updateOne({ id: grn38 }, { $set: { loanStatus: 'TAKEN' } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/transfer-ownership`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId: grn38,
        newCustomerId: customerB,
        movementDate: new Date(),
        remarks: 'Attempt transfer with active loan',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Active loan hold');
  });
});
