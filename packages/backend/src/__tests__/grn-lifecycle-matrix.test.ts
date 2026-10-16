import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase } from './helpers/stock-reset.js';
import { assertCollectionsEmpty, resetAllFinancialCollections, seedCommodityWithRates } from './helpers/lifecycle-testkit.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const FAC = 'fac-lifecycle-matrix';

describe('GRN lifecycle matrix (Phase 7)', () => {
  let adminToken = '';
  let custA = '';
  let custB = '';
  let cmd = '';

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({ userId: 'usr-matrix', username: 'matrix.admin', role: 'ADMIN', facilityIds: [FAC] }));
  });
  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetAllFinancialCollections();
    await assertCollectionsEmpty();
    await seedFacility({ id: FAC, code: 'MTX', name: 'Matrix Facility' });
    custA = await seedCustomer({ id: 'cust-mtx-a', facilityId: FAC, name: 'Kalyan' });
    custB = await seedCustomer({ id: 'cust-mtx-b', facilityId: FAC, name: 'Balaji' });
    cmd = await seedCommodityWithRates({ id: 'cmd-mtx', name: 'Potato', seasonal: { small: 10, big: 15 }, monthly: { small: 12, big: 18 } });
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('Seasonal_3M validates against the Seasonal controller row', async () => {
    const bad = await request(app).post(`/api/facilities/${FAC}/grns`).set(auth()).send({
      grnNumber: '0101', customerId: custA, commodityId: cmd, chamber: 'CH-01', bags: 40,
      bagType: 'S', rentType: 'Seasonal_3M', smallBagPrice: 999, date: '2026-06-01',
    });
    expect(bad.status, JSON.stringify(bad.body).slice(0, 300)).toBe(400);
    const good = await request(app).post(`/api/facilities/${FAC}/grns`).set(auth()).send({
      grnNumber: '0102', customerId: custA, commodityId: cmd, chamber: 'CH-01', bags: 40,
      bagType: 'S', rentType: 'Seasonal_3M', smallBagPrice: 10, date: '2026-06-01',
    });
    expect([200, 201], JSON.stringify(good.body).slice(0, 300)).toContain(good.status);
  });

  it('batch rate update is all-or-nothing', async () => {
    const res = await request(app).put(`/api/commodities/${cmd}/rates/batch`).set(auth()).send({
      rates: [
        { rentType: 'Seasonal', smallRate: 11, bigRate: 16 },
        { rentType: 'Monthly', smallRate: 0, bigRate: 18 },
      ],
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(400);
    const seasonal = await CommodityRateModel.findOne({ commodityId: cmd, rentType: 'Seasonal' }).lean().exec();
    expect(seasonal?.smallRate).toBe(10);
  });

  it('delivery idempotency returns original on retry and rejects changed payload', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0201', date: new Date('2026-06-01') });
    const key = 'idem-matrix-001';
    const base = { grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-07-01', vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9001', idempotencyKey: key };
    const r1 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(base);
    expect([200, 201], JSON.stringify(r1.body).slice(0, 300)).toContain(r1.status);
    const r2 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(base);
    expect([200, 201], JSON.stringify(r2.body).slice(0, 300)).toContain(r2.status);
    expect(r2.body.delivery.id).toBe(r1.body.delivery.id);
    const count = await DeliveryChallanModel.countDocuments({ facilityId: FAC, idempotencyKey: key });
    expect(count).toBe(1);
    const r3 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({ ...base, smallBags: 20, quantity: 20 });
    expect(r3.status, JSON.stringify(r3.body).slice(0, 300)).toBe(409);
  });

  it('concurrent identical deliveries with one key both return the original', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0202', date: new Date('2026-06-01') });
    const key = 'idem-matrix-race-001';
    const payload = { grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-07-01', vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9002', idempotencyKey: key };
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload),
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload),
    ]);
    expect([200, 201], JSON.stringify(r1.body).slice(0, 300)).toContain(r1.status);
    expect([200, 201], JSON.stringify(r2.body).slice(0, 300)).toContain(r2.status);
    expect(r1.body.delivery.id).toBe(r2.body.delivery.id);
    const challans = await DeliveryChallanModel.find({ facilityId: FAC, idempotencyKey: key }).lean().exec();
    expect(challans.length).toBe(1);
    const txns = await InventoryTransactionModel.find({ facilityId: FAC, grnId: gid, transactionType: 'OUTWARD_DELIVERY' }).lean().exec();
    expect(txns.length).toBe(1);
    expect(txns.reduce((s, t) => s + t.smallQuantity + t.bigQuantity, 0)).toBe(10);
  });

  it('full merge transfers all stock and closes source GRN', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0301' });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0302' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'full merge matrix test',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.status).toBe('CLOSED');
    expect(src?.bags).toBe(100);
    expect(res.body.targetGrn.bags).toBe(200);
  });

  it('cross-rent-type merge is blocked', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S', smallBags: 50, bigBags: 0, rentType: 'Seasonal', rentAmount: 500, grnNumber: '0401' });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S', smallBags: 50, bigBags: 0, rentType: 'Monthly', rentAmount: 600, grnNumber: '0402' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(), remarks: 'cross-type must block',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(400);
    expect(String(res.body.error ?? res.text ?? '')).toMatch(/Rent type mismatch/i);
  });

  it('full ownership transfer transfers entire lot to new customer', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0501' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/transfer-ownership`).set(auth()).send({
      grnId: gid, newCustomerId: custB, movementDate: new Date(), remarks: 'full transfer matrix test', paymentDecision: 'AGREED_PENDING',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const updated = await GrnModel.findOne({ id: gid }).lean().exec();
    expect(updated?.customerId).toBe(custB);
    expect(updated?.customerName).toBe('Balaji');
    expect(updated?.status).toBe('OPEN');
    expect(updated?.bags).toBe(100);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('full merge followed by outward delivery preserves audit and reconciles ledger', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0601', date: new Date('2026-06-01') });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0602', date: new Date('2026-06-01') });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date('2026-07-01'),
      remarks: 'full merge test',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.status).toBe('CLOSED');
    const d1 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: target, quantity: 50, smallBags: 50, bigBags: 0, date: '2026-07-10',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9201',
    });
    expect([200, 201], JSON.stringify(d1.body).slice(0, 300)).toContain(d1.status);
    expect(d1.body.summary.remainingDeliveryBalance).toBe(150);
    const tgt = await GrnModel.findOne({ id: target }).lean().exec();
    expect(tgt?.bags).toBe(200);
  });

  it('unsegregated lots allow S/B delivery and reconcile ledger', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S/B', rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0801', date: new Date('2026-06-01') });
    const cross = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: gid, quantity: 50, smallBags: 30, bigBags: 20, date: '2026-07-01',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9301',
    });
    expect([200, 201], JSON.stringify(cross.body).slice(0, 300)).toContain(cross.status);
    expect(cross.body.delivery.smallBags).toBe(30);
    expect(cross.body.delivery.bigBags).toBe(20);
    const exact = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: gid, quantity: 50, smallBags: 50, bigBags: 0, date: '2026-07-01',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9302',
    });
    expect([200, 201], JSON.stringify(exact.body).slice(0, 300)).toContain(exact.status);
    expect(exact.body.delivery.smallBags).toBe(50);
    expect(exact.body.delivery.bigBags).toBe(0);
  });

  it('merge with a finalized January extension bills each period once', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0901', date: new Date('2025-06-01') });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0902', date: new Date('2024-07-10') });
    const ext = await request(app).post(`/api/facilities/${FAC}/rent/extensions/finalize`).set(auth()).send({
      grnId: source, seasonYear: 2024, period: 'JANUARY',
    });
    expect(ext.status, JSON.stringify(ext.body).slice(0, 300)).toBe(201);
    expect(ext.body.extension.finalAmount).toBe(1200);
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date('2025-07-01'),
      remarks: 'merge with january extension billed once',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    // Carried covers SEASON_2024 + FEB_2025 (JAN_2025 finalized): 1000 + 1200 + 1200 = 3400.
    // SEASON_2025 is excluded from carried debt because surviving target GRN bills Season 2025.
    // target = 1000 + 3400 = 4400 (not 5400 duplicate).
    expect(res.body.targetGrn.rentAmount).toBe(4400);
    const src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.status).toBe('CLOSED');
  });

  it('full transfer with a finalized January extension bills each period once', async () => {
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0903', date: new Date('2024-07-10') });
    const ext = await request(app).post(`/api/facilities/${FAC}/rent/extensions/finalize`).set(auth()).send({
      grnId: source, seasonYear: 2024, period: 'JANUARY',
    });
    expect(ext.status, JSON.stringify(ext.body).slice(0, 300)).toBe(201);
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/transfer-ownership`).set(auth()).send({
      grnId: source, newCustomerId: custB, movementDate: new Date('2025-03-15'),
      remarks: 'transfer with january extension billed once', paymentDecision: 'AGREED_PENDING',
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const sum = await request(app).get(`/api/facilities/${FAC}/rent/grn/${source}`).set(auth());
    expect(sum.status, JSON.stringify(sum.body).slice(0, 300)).toBe(200);
    // 3200 prospective + 1200 extension = 4400 (not 5600).
    expect(sum.body.remainingBalance).toBe(4400);
  });
});
