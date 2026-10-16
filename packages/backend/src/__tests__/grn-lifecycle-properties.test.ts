import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase } from './helpers/stock-reset.js';
import { assertCollectionsEmpty, resetAllFinancialCollections, seedCommodityWithRates } from './helpers/lifecycle-testkit.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const FAC = 'fac-lifecycle-props';

describe('GRN lifecycle properties: cumulative, concurrency, frozen dates', () => {
  let adminToken = '';
  let cust = '';
  let cmd = '';
  let hamCmd = '';

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({ userId: 'usr-props', username: 'props.admin', role: 'ADMIN', facilityIds: [FAC] }));
  });
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetAllFinancialCollections();
    await assertCollectionsEmpty();
    await seedFacility({ id: FAC, code: 'PRP', name: 'Props Facility' });
    cust = await seedCustomer({ id: 'cust-prp', facilityId: FAC, name: 'Props Farmer' });
    cmd = await seedCommodityWithRates({ id: 'cmd-prp', name: 'Potato', seasonal: { small: 10, big: 15 }, monthly: { small: 12, big: 18 } });
    hamCmd = await seedCommodityWithRates({ id: 'cmd-prp-ham', name: 'Ham Potato', hamaliApplicable: true, hamaliRate: 4, seasonal: { small: 10, big: 15 }, monthly: { small: 12, big: 18 } });
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('three-way split conserves rent, hamali and stock exactly', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: cust, customerName: 'Props Farmer', commodityId: hamCmd, commodityName: 'Ham Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0701', date: new Date('2026-06-01') });
    // Hamali pool 100 x Rs 4 = Rs 400; rent 100 x Rs 10 = Rs 1000.
    // 30 bags -> 300 rent + 120 hamali = 420; 40 bags -> 400 + 160 = 560.
    const expected = [420, 420, 560];
    let n = 0;
    for (const [qty, gp] of [[30, 'GP-7101'], [30, 'GP-7102'], [40, 'GP-7103']] as const) {
      const res = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
        grnId: gid, quantity: qty, smallBags: qty, bigBags: 0, date: '2026-07-10',
        vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: gp,
      });
      expect([200, 201]).toContain(res.status);
      expect(res.body.delivery.rentCharge).toBe(expected[n]);
      n += 1;
    }
    const txns = await InventoryTransactionModel.find({ facilityId: FAC, grnId: gid, transactionType: 'OUTWARD_DELIVERY' }).lean().exec();
    expect(txns.reduce((s, t) => s + t.smallQuantity + t.bigQuantity, 0)).toBe(100);
    const sum = await request(app).get(`/api/facilities/${FAC}/rent/grn/${gid}`).set(auth());
    // Rent 1000 + hamali 400 collected across parts; 1400 due, 0 paid.
    expect(sum.body.totalDue).toBe(1400);
    expect(sum.body.remainingBalance).toBe(1400);
  });

  it('concurrent oversell with distinct keys delivers at most the inward stock', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: cust, customerName: 'Props Farmer', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0702', date: new Date('2026-06-01') });
    const payload = (gp: string) => ({
      grnId: gid, quantity: 60, smallBags: 60, bigBags: 0, date: '2026-07-01',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: gp,
    });
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload('GP-7201')),
      request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send(payload('GP-7202')),
    ]);
    const okCount = [r1.status, r2.status].filter((s) => s === 200 || s === 201).length;
    expect(okCount).toBe(1);
    const txns = await InventoryTransactionModel.find({ facilityId: FAC, grnId: gid, transactionType: 'OUTWARD_DELIVERY' }).lean().exec();
    expect(txns.reduce((s, t) => s + t.smallQuantity + t.bigQuantity, 0)).toBeLessThanOrEqual(100);
  });

  it('concurrent full-balance payments collect at most once', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: cust, customerName: 'Props Farmer', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal', rentAmount: 1000, grnNumber: '0703', date: new Date('2026-06-01') });
    const pay = () => request(app).post(`/api/facilities/${FAC}/rent/collect`).set(auth()).send({
      grnId: gid, amountPaid: 1000, paymentMode: 'Cash', paymentDate: '2026-07-01',
    });
    const [p1, p2] = await Promise.all([pay(), pay()]);
    const okCount = [p1.status, p2.status].filter((s) => s === 200 || s === 201).length;
    expect(okCount).toBe(1);
    const sum = await request(app).get(`/api/facilities/${FAC}/rent/grn/${gid}`).set(auth());
    expect(sum.body.totalPaid).toBeLessThanOrEqual(1000);
  });

  it('Seasonal_3M bills no extra month within 3 cycles and monthly extra after', async () => {
    const gid = await seedGrn({ facilityId: FAC, customerId: cust, customerName: 'Props Farmer', commodityId: cmd, commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0, rentType: 'Seasonal_3M', rentAmount: 1000, grnNumber: '0704', date: new Date('2026-06-01') });
    const at3 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-08-31',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-7301',
    });
    expect([200, 201]).toContain(at3.status);
    expect(at3.body.delivery.rentCharge).toBe(100);
    const after3 = await request(app).post(`/api/facilities/${FAC}/deliveries`).set(auth()).send({
      grnId: gid, quantity: 10, smallBags: 10, bigBags: 0, date: '2026-10-02',
      vehicleNumber: 'MH12AB1234', driverName: 'Driver', gpNumber: 'GP-7302',
    });
    expect([200, 201]).toContain(after3.status);
    expect(after3.body.delivery.rentCharge).toBe(100 + 240);
    const src = await GrnModel.findOne({ id: gid }).lean().exec();
    expect(src?.bags).toBe(100);
  });
});
