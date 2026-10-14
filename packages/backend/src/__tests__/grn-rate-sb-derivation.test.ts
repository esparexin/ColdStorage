import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { nextTestGrnNumber } from './helpers/grn-number-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const FACILITY_ID = 'fac-rate-sb-derive';

describe('Canonical S/B rate validation & auto-derivation of inward obligation', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-rate-sb-derive',
      username: 'rate.sb.admin',
      role: 'ADMIN',
      facilityIds: [FACILITY_ID],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await seedFacility({ id: FACILITY_ID, code: 'RTSB', name: 'Rate SB Facility' });
    customerId = await seedCustomer({ id: 'cust-rate-sb', facilityId: FACILITY_ID, name: 'Rate SB Customer' });

    const commodity = await CommodityModel.create({
      id: 'cmd-rate-sb',
      name: 'Potato SB',
      normalizedName: 'potato sb',
      isActive: true,
    });
    commodityId = commodity.id;

    await CommodityRateModel.create({
      id: 'crt-rate-sb-1',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });
  });

  function postInbound(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post(`/api/facilities/${FACILITY_ID}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: nextTestGrnNumber(),
        customerId,
        commodityId,
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        ...overrides,
      });
  }

  it('requires both rates for canonical S/B bag type instead of a lone bagPrice', async () => {
    const res = await postInbound({ smallBags: 50, bigBags: 50, bagPrice: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('both Small and Big');
  });

  it('derives and persists authoritative seasonal rentAmount when omitted in creation payload', async () => {
    const res = await postInbound({
      bags: 100,
      smallBags: 60,
      bigBags: 40,
      smallBagPrice: 12,
      bigBagPrice: 18,
    });
    expect(res.status).toBe(201);
    // 60 × 12 + 40 × 18 = 720 + 720 = 1440
    expect(res.body.grn.rentAmount).toBe(1440);
  });

  it('rejects unverified S/B lots when differential rates exist', async () => {
    const res = await postInbound({
      bags: 100,
      smallBagPrice: 12,
      bigBagPrice: 18,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Small and big bag composition unverified');
  });

  it('accepts unsegregated S/B lots when rates are equal', async () => {
    // Configure equal rates
    await CommodityRateModel.updateOne(
      { commodityId, rentType: 'Seasonal' },
      { $set: { smallRate: 15, bigRate: 15 } },
    );
    const res = await postInbound({
      bags: 100,
      smallBagPrice: 15,
      bigBagPrice: 15,
    });
    expect(res.status).toBe(201);
    expect(res.body.grn.rentAmount).toBe(1500);
  });
});
