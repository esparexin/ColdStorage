import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { isDuplicateKeyError, isIdempotencyDuplicateKey } from '../modules/delivery/handlers/delivery-idempotency.helper.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const FAC = 'fac-lifecycle-matrix';

describe('GRN lifecycle matrix (Phase 7)', () => {
  let adminToken = '';
  let custA = '';
  let custB = '';
  let cmd = '';

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({ userId: 'usr-matrix', username: 'matrix.admin', role: 'ADMIN', facilityIds: [FAC] }));
  });
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: FAC, code: 'MTX', name: 'Matrix Facility' });
    custA = await seedCustomer({ id: 'cust-mtx-a', facilityId: FAC, name: 'Kalyan' });
    custB = await seedCustomer({ id: 'cust-mtx-b', facilityId: FAC, name: 'Balaji' });
    const c = await CommodityModel.create({ id: 'cmd-mtx', name: 'Potato', normalizedName: 'potato', isActive: true });
    cmd = c.id;
    await CommodityRateModel.create([
      { id: 'crt-mtx-s', commodityId: cmd, rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true },
      { id: 'crt-mtx-m', commodityId: cmd, rentType: 'Monthly', smallRate: 12, bigRate: 18, isActive: true },
    ]);
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('Seasonal_3M validates against the Seasonal controller row', async () => {
    const bad = await request(app).post(`/api/facilities/${FAC}/grns`).set(auth()).send({
      grnNumber: '0101', customerId: custA, commodityId: cmd, chamber: 'CH-01', bags: 40,
      bagType: 'S', rentType: 'Seasonal_3M', smallBagPrice: 999, date: '2026-06-01',
    });
    expect(bad.status).toBe(400);
    const good = await request(app).post(`/api/facilities/${FAC}/grns`).set(auth()).send({
      grnNumber: '0102', customerId: custA, commodityId: cmd, chamber: 'CH-01', bags: 40,
      bagType: 'S', rentType: 'Seasonal_3M', smallBagPrice: 10, date: '2026-06-01',
    });
    expect([200, 201]).toContain(good.status);
  });

  it('batch rate update is all-or-nothing', async () => {
    const res = await request(app).put(`/api/commodities/${cmd}/rates/batch`).set(auth()).send({
      rates: [
        { rentType: 'Seasonal', smallRate: 11, bigRate: 16 },
        { rentType: 'Monthly', smallRate: 0, bigRate: 18 },
      ],
    });
    expect(res.status).toBe(400);
    const seasonal = await CommodityRateModel.findOne({ commodityId: cmd, rentType: 'Seasonal' }).lean().exec();
    expect(seasonal?.smallRate).toBe(10);
  });

  it('delivery idempotency returns original on retry and rejects changed payload', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0201', date: new Date('2026-06-01') });
    const key = 'idem-matrix-001';
    const base = { grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-07-01', vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9001', idempotencyKey: key };
    const r1 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(base);
    expect([200, 201]).toContain(r1.status);
    const r2 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(base);
    expect([200, 201]).toContain(r2.status);
    expect(r2.body.delivery.id).toBe(r1.body.delivery.id);
    const count = await DeliveryChallanModel.countDocuments({ facilityId: FAC, idempotencyKey: key });
    expect(count).toBe(1);
    const r3 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({ ...base, smallBags: 20, quantity: 20 });
    expect(r3.status).toBe(409);
  });

  it('concurrent identical deliveries with one key both return the original', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0202', date: new Date('2026-06-01') });
    const key = 'idem-matrix-race-001';
    const payload = { grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-07-01', vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9002', idempotencyKey: key };
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload),
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload),
    ]);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    expect(r1.body.delivery.id).toBe(r2.body.delivery.id);
    const challans = await DeliveryChallanModel.find({ facilityId: FAC, idempotencyKey: key }).lean().exec();
    expect(challans.length).toBe(1);
    const txns = await InventoryTransactionModel.find({ facilityId: FAC, grnId: gid, transactionType: 'OUTWARD_DELIVERY' }).lean().exec();
    expect(txns.length).toBe(1);
    expect(txns.reduce((s, t) => s + t.smallQuantity + t.bigQuantity, 0)).toBe(10);
  });

  it('partial merge keeps source OPEN with remainder', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0301' });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0302' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'partial merge matrix test', partialMoves: [{ sourceGrnId: source, smallBags: 30, bigBags: 0 }],
    });
    expect(res.status).toBe(200);
    const src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.status).toBe('OPEN');
    expect(src?.bags).toBe(100);
    expect(src?.smallBags).toBe(100);
    expect(res.body.targetGrn.bags).toBe(130);
  });

  it('cross-rent-type merge is blocked', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S', smallBags: 50, bigBags: 0, rentType: 'Seasonal', rentAmount: 500, grnNumber: '0401' });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 50, bagType: 'S', smallBags: 50, bigBags: 0, rentType: 'Monthly', rentAmount: 600, grnNumber: '0402' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(), remarks: 'cross-type must block',
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error ?? res.text ?? '')).toMatch(/Rent type mismatch/i);
  });

  it('partial transfer splits to a new GRN and retains source liability', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0501' });
    const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/transfer-ownership`).set(auth()).send({
      grnId: gid, newCustomerId: custB, movementDate: new Date(), remarks: 'partial transfer matrix test',
      transferSmallBags: 30, transferBigBags: 0, newGrnNumber: '0502',
    });
    expect(res.status).toBe(200);
    const src = await GrnModel.findOne({ id: gid }).lean().exec();
    const dst = await GrnModel.findOne({ facilityId: FAC, grnNumber: '0502' }).lean().exec();
    expect(src?.status).toBe('OPEN');
    expect(src?.bags).toBe(100);
    expect(src?.smallBags).toBe(100);
    expect(dst?.bags).toBe(30);
    expect(dst?.customerId).toBe(custB);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('duplicate-key classifier routes idempotency races without leaking internals', () => {
    const idemDup = { code: 11000, keyPattern: { facilityId: 1, idempotencyKey: 1 }, message: 'E11000 duplicate key error collection: db.deliverychallans index: facilityId_1_idempotencyKey_1' };
    expect(isDuplicateKeyError(idemDup)).toBe(true);
    expect(isIdempotencyDuplicateKey(idemDup)).toBe(true);
    const otherDup = { code: 11000, keyPattern: { facilityId: 1, gpNumber: 1 }, message: 'E11000 duplicate key error index: facilityId_1_gpNumber_1' };
    expect(isDuplicateKeyError(otherDup)).toBe(true);
    expect(isIdempotencyDuplicateKey(otherDup)).toBe(false);
    expect(isDuplicateKeyError({ code: 112 })).toBe(false);
    expect(isDuplicateKeyError(new Error('plain'))).toBe(false);
  });

  it('repeated partials then final outward preserve receipt and reconcile ledger', async () => {
    const target = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0601', date: new Date('2026-06-01') });
    const source = await seedGrn({ facilityId: FAC, customerId: custA, customerName: 'Kalyan', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0602', date: new Date('2026-06-01') });
    for (const [qty, day] of [[30, '2026-07-01'], [20, '2026-07-05']] as const) {
      const res = await request(app).post(`/api/facilities/${FAC}/internal-movements/merge`).set(auth()).send({
        targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(day),
        remarks: `repeat partial ${qty}`, partialMoves: [{ sourceGrnId: source, smallBags: qty, bigBags: 0 }],
      });
      expect(res.status).toBe(200);
    }
    let src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.status).toBe('OPEN');
    expect(src?.bags).toBe(100);
    expect(src?.smallBags).toBe(100);
    const d1 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: source, quantity: 50, smallBags: 50, bigBags: 0, date: '2026-07-10',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-9201',
    });
    expect([200, 201]).toContain(d1.status);
    expect(d1.body.summary.remainingDeliveryBalance).toBe(0);
    src = await GrnModel.findOne({ id: source }).lean().exec();
    expect(src?.bags).toBe(100);
    expect(src?.smallBags).toBe(100);
    const outTxns = await InventoryTransactionModel.find({ facilityId: FAC, grnId: source, transactionType: 'OUTWARD_DELIVERY' }).lean().exec();
    expect(outTxns.reduce((s, t) => s + t.smallQuantity + t.bigQuantity, 0)).toBe(100);
    const sum = await request(app).get(`/api/facilities/${FAC}/rent/grn/${source}`).set(auth());
    expect(sum.status).toBe(200);
    const remaining = sum.body.remainingBalance ?? 0;
    if (remaining > 0) {
      const pay = await request(app).post(`/api/facilities/${FAC}/rent/collect`).set(auth()).send({
        grnId: source, amountPaid: remaining, paymentMode: 'Cash', paymentDate: '2026-07-11',
      });
      expect([200, 201]).toContain(pay.status);
    }
    const sum2 = await request(app).get(`/api/facilities/${FAC}/rent/grn/${source}`).set(auth());
    expect(sum2.body.remainingBalance).toBe(0);
    const tgt = await GrnModel.findOne({ id: target }).lean().exec();
    expect(tgt?.bags).toBe(150);
  });
});
