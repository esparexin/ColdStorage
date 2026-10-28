import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { correctGrnSchema } from '@cold-storage/contracts';
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
const facilityId = 'fac-grn-number-guards';

/**
 * Duplicate-GRN prevention and GRN-number immutability.
 *
 * The service pre-check rejects sequential duplicates, but only the database
 * unique index can serialize concurrent writers — the concurrent test below
 * fails closed (201 + 409, single row) only when enforcement is present.
 * `ensureIndexes` here prepares the isolated test database only; application
 * code must never create or synchronize indexes (governance invariant).
 */
describe('GRN number guards (duplicate prevention + edit immutability)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-grn-guards',
      username: 'grn.guards',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  async function reset() {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await seedFacility({ id: facilityId, code: 'GRNG', name: 'Guard Facility' });
    customerId = await seedCustomer({ id: 'cust-grn-guards', facilityId, name: 'Guard Farmer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-grn-guards',
      name: 'Guard Paddy',
      normalizedName: 'guard paddy',
      isActive: true,
    });
    commodityId = cmd.id;
    // Test-setup only, isolated test database: ensure exactly the uniqueness
    // index under test. Application code must never create or synchronize
    // indexes (governance invariant); this mirrors the declared production
    // index so the concurrency test is deterministic instead of racing
    // Mongoose background autoIndex.
    await GrnModel.collection.createIndex({ facilityId: 1, grnNumber: 1 }, { unique: true });
  }

  function inbound(grnNumber: string, overrides: Record<string, unknown> = {}) {
    return request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber,
        customerId,
        commodityId,
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
        ...overrides,
      });
  }

  it('rejects a sequential duplicate GRN number with 409', async () => {
    await reset();
    const first = await inbound('1111');
    expect(first.status).toBe(201);
    const second = await inbound('1111');
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('already exists');
    expect(await GrnModel.countDocuments({ facilityId, grnNumber: '1111' })).toBe(1);
  });

  it('serializes concurrent duplicate creates: one 201, one 409, single row', async () => {
    await reset();
    const [a, b] = await Promise.all([inbound('2222'), inbound('2222')]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await GrnModel.countDocuments({ facilityId, grnNumber: '2222' })).toBe(1);
  });

  it('rejects grnNumber and inwardReceiptNumber in correction requests', () => {
    for (const forbidden of [{ grnNumber: '9999' }, { inwardReceiptNumber: 'RCPT-X' }]) {
      const parsed = correctGrnSchema.safeParse({ ...forbidden, reason: 'Audit reason here' });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects GRN-number mutation through the PATCH correction endpoint', async () => {
    await reset();
    const grnId = await seedGrn({ facilityId, customerId, commodityId, chamber: 'CH-01', bags: 50 });
    const res = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grnNumber: '9999', reason: 'Attempted renumber' });
    expect(res.status).toBe(400);
  });

  it('preserves numbering identity through a legitimate correction', async () => {
    await reset();
    const grnId = await seedGrn({ facilityId, customerId, commodityId, chamber: 'CH-01', bags: 50 });
    const before = await GrnModel.findOne({ id: grnId }).lean().exec();
    const res = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ chamber: 'CH-02', reason: 'Chamber relabel verified' });
    expect(res.status).toBe(200);
    expect(res.body.grn.grnNumber).toBe(before?.grnNumber);
    expect(res.body.grn.inwardReceiptNumber).toBe(before?.inwardReceiptNumber);
    const after = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(after?.grnNumber).toBe(before?.grnNumber);
    expect(after?.inwardReceiptNumber).toBe(before?.inwardReceiptNumber);
  });
});
