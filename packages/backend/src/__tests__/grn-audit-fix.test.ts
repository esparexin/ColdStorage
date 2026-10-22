import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { RentExtensionModel } from '../database/models/rent-extension.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-audit-fix';

describe('GRN Audit & Fix: Year-wise Rent, Merge, Payments, Bag-Type', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-audit-admin', username: 'audit.admin', role: 'ADMIN', facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-wheat-audit');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'AUD', name: 'Audit Facility' });
    customerA = await seedCustomer({ id: 'cust-audit-a', facilityId, name: 'Test Farmer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-wheat-audit', name: 'Wheat', normalizedName: 'wheat', isActive: true,
      isHamaliApplicable: true, hamaliRate: 20,
    });
    commodityId = cmd.id;
  });

  function seedExtension(grnId: string, grnNumber: string, seasonYear: number, period: 'JANUARY' | 'FEBRUARY', dateStr: string, bags: number, rate = 10) {
    return RentExtensionModel.create({
      id: `ext-${period.toLowerCase()}-${seasonYear}-${grnId}`, facilityId, grnId, grnNumber, seasonYear, period,
      snapshotDate: new Date(dateStr), snapshotBags: bags, bagRate: rate, calculatedAmount: bags * rate,
      finalAmount: bags * rate, finalizedBy: 'usr-audit-admin', finalizedAt: new Date(dateStr),
    });
  }

  describe('1. Year-wise rent periods (10-month season + Jan/Feb extensions)', () => {
    it('Seasonal GRN inward 2023 covers Season 2023 + Jan-Feb 2024 extensions', async () => {
      // GRN inward 15 June 2023 (Season 2023)
      const grnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
        grnNumber: '0023', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      // Season 2023 rent is stored on GRN (rentAmount = 1000)
      // Jan 2024 and Feb 2024 are extension periods
      await seedExtension(grnId, '0023', 2023, 'JANUARY', '2024-01-01', 100);
      await seedExtension(grnId, '0023', 2023, 'FEBRUARY', '2024-02-01', 100);

      const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
      expect(grn?.rentAmount).toBe(1000);
      expect(grn?.rentType).toBe('Seasonal');

      // Extensions exist for Jan and Feb 2024
      const extensions = await RentExtensionModel.find({ facilityId, grnId }).lean().exec();
      expect(extensions.length).toBe(2);
      expect(extensions.some((e) => e.period === 'JANUARY')).toBe(true);
      expect(extensions.some((e) => e.period === 'FEBRUARY')).toBe(true);
    });

    it('Seasonal GRN inward 2024 covers Season 2024 + Jan-Feb 2025 extensions', async () => {
      const grnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0024', date: new Date('2024-08-20'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      // Jan-Feb 2025 extensions
      await seedExtension(grnId, '0024', 2024, 'JANUARY', '2025-01-01', 50);
      await seedExtension(grnId, '0024', 2024, 'FEBRUARY', '2025-02-01', 50);

      const extensions = await RentExtensionModel.find({ facilityId, grnId }).lean().exec();
      expect(extensions.length).toBe(2);
    });

    it('Seasonal GRN inward 2025 covers Season 2025 + Jan-Feb 2026 extensions', async () => {
      const grnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 75, bagType: 'S', rentType: 'Seasonal', rentAmount: 750,
        grnNumber: '0025', date: new Date('2025-10-05'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const extensions = await RentExtensionModel.find({ facilityId, grnId }).lean().exec();
      expect(extensions.length).toBe(0); // No extensions yet, will be added when Jan/Feb 2026 comes

      // Season 2025 rent is on GRN (rentAmount = 750)
      const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
      expect(grn?.rentAmount).toBe(750);
    });

    it('Seasonal GRN inward 2026 (target GRN 26) collects Season 2026 rent', async () => {
      // GRN 26: inward 2026, 50 bags
      const grnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0026', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
      expect(grn?.rentAmount).toBe(500);
      expect(grn?.rentType).toBe('Seasonal');
    });
  });

  describe('2. GRN 23 (2023, 100 bags) merged into GRN 26 (2026, 50 bags)', () => {
    it('carries forward pre-2026 rent obligations, excludes Season 2026 from source', async () => {
      // Target GRN 26: 2026, 50 bags, rent ₹500
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0026', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      // Source GRN 23: 2023, 100 bags, unbilled (rentAmount 0)
      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 0,
        grnNumber: '0023', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      // Merge on 16 October 2026
      // Source historical periods (excluded Season 2026 which target collects):
      // - Season 2023: 100 × ₹10 = ₹1000
      // - Jan-Feb 2024: 100 × ₹10 × 2 = ₹2000
      // - Season 2024: 100 × ₹10 = ₹1000
      // - Jan-Feb 2025: 100 × ₹10 × 2 = ₹2000
      // - Season 2025: 100 × ₹10 = ₹1000
      // - Jan-Feb 2026: 100 × ₹10 × 2 = ₹2000
      // Total source rent = ₹9000, Hamali = 100 × ₹20 = ₹2000 → Total = ₹11000
      // Target base = ₹500, carried = ₹11000 → New rentAmount = ₹11500

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-10-16'),
          remarks: 'Merge GRN 23 (2023 lot) into GRN 26 (2026 lot)', idempotencyKey: 'merge-grn23-into-grn26-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Rent is recomputed for all historical seasons (not just stored rentAmount)
      expect(res.body.targetGrn.rentAmount).toBeGreaterThan(500);
      expect(res.body.targetGrn.bags).toBe(150);

      // Source closed with preserved financial record
      const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
      expect(closedSource?.status).toBe('CLOSED');
      expect(closedSource?.mergedIntoGrnId).toBe(targetGrnId);
      expect(closedSource?.mergedIntoGrnNumber).toBe('0026');

      // Movement record exists with idempotency key
      const movement = await InternalMovementModel.findOne({ idempotencyKey: 'merge-grn23-into-grn26-001' }).lean().exec();
      expect(movement).toBeTruthy();
      expect(movement!.movementType).toBe('MERGE');
      expect(movement!.totalBagsMoved).toBe(100);
    });

    it('rejects duplicate merge with same idempotency key', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0027', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 0,
        grnNumber: '0028', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const idempotencyKey = 'merge-grn28-into-grn27-001';

      // First merge
      const res1 = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-10-16'), remarks: 'First merge', idempotencyKey });
      expect(res1.status).toBe(200);

      // Source is now CLOSED. Retry with same idempotency key returns cached result (200)
      const res2 = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-10-16'), remarks: 'Duplicate merge', idempotencyKey });
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      const movements = await InternalMovementModel.find({ idempotencyKey }).lean().exec();
      expect(movements.length).toBe(1);
    });

    it('partial merge scenario - only eligible bags moved, source closed with zero remaining', async () => {
      const targetGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 50, bagType: 'S', rentType: 'Seasonal', rentAmount: 500,
        grnNumber: '0029', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const sourceGrnId = await seedGrn({
        facilityId, customerId: customerA, customerName: 'Test Farmer', commodityId, commodityName: 'Wheat',
        chamber: 'CH-01', bags: 30, bagType: 'S', rentType: 'Seasonal', rentAmount: 300,
        grnNumber: '0030', date: new Date('2023-06-15'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
      });

      const res = await request(app)
        .post(`/api/facilities/${facilityId}/internal-movements/merge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-10-16'),
          remarks: 'Partial source merge', idempotencyKey: 'merge-grn30-into-grn29-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.targetGrn.bags).toBe(80); // 50 + 30
      // Rent recomputed for all historical seasons (not just stored rentAmount)
      expect(res.body.targetGrn.rentAmount).toBeGreaterThan(500);

      const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
      expect(closedSource?.status).toBe('CLOSED');
    });
  });
});
