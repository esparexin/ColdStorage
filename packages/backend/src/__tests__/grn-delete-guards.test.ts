import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-delete-guards';

describe('GRN Delete Guards & Constraints (Testing Only)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-grn-delete-guards-admin',
      username: 'grn.guards.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});
    await seedFacility({ id: facilityId, code: 'GDL', name: 'Delete Guards Facility' });
    customerId = await seedCustomer({ id: 'cust-gdl-01', facilityId, name: 'Guards Test Customer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-gdl-wheat', name: 'Wheat', normalizedName: 'wheat', isActive: true,
    });
    commodityId = cmd.id;
  });

  it('rejects deletion when GRN has been merged into another GRN', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0042', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
      grnNumber: '0043', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    await GrnModel.updateOne(
      { id: sourceGrnId },
      { $set: { status: 'CLOSED', mergedIntoGrnId: targetGrnId, mergedIntoGrnNumber: '0042' } },
    ).exec();

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${sourceGrnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId: sourceGrnId, confirmationToken: '0043', reason: 'Try deleting merged source GRN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('merged into');
  });

  it('rejects deletion when GRN is a merge target', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0044', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
      grnNumber: '0045', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    await GrnModel.updateOne(
      { id: sourceGrnId },
      { $set: { status: 'CLOSED', mergedIntoGrnId: targetGrnId, mergedIntoGrnNumber: '0044' } },
    ).exec();

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${targetGrnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId: targetGrnId, confirmationToken: '0044', reason: 'Try deleting merge target GRN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('merged into');
  });

  it('rejects deletion when active ISSUED delivery challans exist', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0046', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    await DeliveryChallanModel.create({
      id: 'ch-gdl-02', facilityId, grnId, grnNumber: '0046', challanNumber: 'CH-GDL-02', date: new Date(),
      customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', smallBags: 30, bigBags: 0, status: 'ISSUED', issuedBy: 'usr-grn-delete-guards-admin',
    });

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmationToken: '0046', reason: 'Try deleting GRN with active challan' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('ISSUED');
  });

  it('rejects wrong confirmation token', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0047', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmationToken: 'WRONG', reason: 'Wrong confirmation token' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('does not match');
  });

  it('returns 404 for non-existent GRN', async () => {
    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/grn-nonexistent`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId: 'grn-nonexistent', confirmationToken: 'ANY', reason: 'Non-existent GRN' });

    expect(res.status).toBe(404);
  });

  it('enforces facility scoping - cannot delete GRN from another facility', async () => {
    const otherFacilityId = 'fac-other-gdl';
    await seedFacility({ id: otherFacilityId, code: 'OGD', name: 'Other Facility' });

    const grnId = await seedGrn({
      facilityId: otherFacilityId, customerId, customerName: 'Guards Test Customer',
      commodityId, commodityName: 'Wheat', chamber: 'CH-01', bags: 100, bagType: 'S',
      rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0048',
      date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnId, confirmationToken: '0048', reason: 'Cross-facility delete attempt' });

    expect(res.status).toBe(403);
  });

  it('blocks deletion in production environment', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const grnId = await seedGrn({
        facilityId, customerId, customerName: 'Guards Test Customer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
        grnNumber: '0049', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const res = await request(app)
        .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ grnId, confirmationToken: '0049', reason: 'Production delete attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('disabled in production');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
