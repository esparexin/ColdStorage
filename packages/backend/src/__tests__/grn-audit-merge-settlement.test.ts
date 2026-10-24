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
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-audit-merge-settle';

describe('GRN Audit: Bag Types, Payment Settlement, Hamali & Verification', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-audit-merge-admin', username: 'audit.merge.admin', role: 'ADMIN', facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-wheat-audit-merge');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'AMS', name: 'Audit Merge Facility' });
    customerA = await seedCustomer({ id: 'cust-audit-ams-a', facilityId, name: 'Test Farmer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-wheat-audit-merge', name: 'Wheat', normalizedName: 'wheat', isActive: true,
      isHamaliApplicable: true, hamaliRate: 20,
    });
    commodityId = cmd.id;
  });

  describe('3. Multiple bag types in merge', () => {
    it('merges S and B bag types, resolves to S+B', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', smallBags: 50, bigBags: 0,
        rentType: 'Seasonal', rentAmount: 500, grnNumber: '0031',
        date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 15, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 30, bagType: 'B', smallBags: 0, bigBags: 30,
        rentType: 'Seasonal', rentAmount: 450, grnNumber: '0032',
        date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 15, bagPrice: 15,
      });

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId],
          movementDate: new Date('2026-10-16'),
          remarks: 'Merge S + B into S+B',
          repackedSmallBags: 0,
          repackedBigBags: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.targetGrn.bags).toBe(80);
      expect(res.body.targetGrn.smallBags).toBe(50);
      expect(res.body.targetGrn.bigBags).toBe(30);
      expect(res.body.targetGrn.bagType).toBe('S+B');
    });
  });

  describe('4. Payment settlement does not block merge', () => {
    it('merge proceeds even when source has unsettled rent', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0033', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 30, bagType: 'S', rentType: 'Seasonal', rentAmount: 300,
        grnNumber: '0034', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId],
          movementDate: new Date('2026-10-16'),
          remarks: 'Merge with unsettled rent',
          idempotencyKey: 'merge-grn34-into-grn33-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.targetGrn.rentAmount).toBe(500);
      expect(res.body.targetGrn.bags).toBe(80);

      const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
      expect(closedSource?.status).toBe('CLOSED');
      expect(closedSource?.remarks).toContain('Pending');
    });

    it('merge with pre-settled source rent preserves payment history', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0035', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 30, bagType: 'S', rentType: 'Seasonal', rentAmount: 300,
        grnNumber: '0036', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      await RentPaymentModel.create({
        id: 'rp-settled-src', facilityId, grnId: sourceGrnId, grnNumber: '0036',
        receiptNumber: 'RCPT-SETTLED-01', amountPaid: 300, paymentMode: 'Cash',
        paymentDate: new Date('2026-03-01'), createdBy: 'usr-audit-merge-admin',
      });

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId],
          movementDate: new Date('2026-10-16'),
          remarks: 'Merge fully settled source',
          idempotencyKey: 'merge-grn36-into-grn35-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.targetGrn.bags).toBe(80);

      const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
      expect(closedSource?.status).toBe('CLOSED');
      expect(closedSource?.remarks).toContain('Paid');

      const sourcePayments = await RentPaymentModel.find({ grnId: sourceGrnId }).lean().exec();
      expect(sourcePayments.length).toBe(1);
      expect(sourcePayments[0].amountPaid).toBe(300);
    });
  });

  describe('5. Hamali application in merge', () => {
    it('Hamali charged on source intake, preserved across merge', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0037', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 0,
        grnNumber: '0038', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId],
          movementDate: new Date('2026-10-16'),
          remarks: 'Merge with hamali',
          idempotencyKey: 'merge-grn38-into-grn37-001',
        });

      expect(res.status).toBe(200);
    });
  });

  describe('6. Bag-type confirmation (isCompositionVerified)', () => {
    it('unverified S/B placeholder does not default to verified in DB', async () => {
      const grnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S/B',
        rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0039',
        date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
      expect(grn?.isCompositionVerified).not.toBe(true);
    });
  });
});
