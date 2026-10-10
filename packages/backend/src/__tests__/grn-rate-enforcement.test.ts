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

const FACILITY_ID = 'fac-rate-enforce';

/**
 * Price Controller enforcement on Inward: submitted agreed rates must match the
 * active controller row when one exists; unconfigured commodities keep the
 * legacy path so history, imports, and existing flows are untouched.
 */
describe('GRN rate enforcement — grn-rate-enforcement.test.ts', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-rate-enforce',
      username: 'rate.enforce.admin',
      role: 'ADMIN',
      facilityIds: [FACILITY_ID],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});

    await seedFacility({ id: FACILITY_ID, code: 'RATE', name: 'Rate Facility' });
    customerId = await seedCustomer({ id: 'cust-rate', facilityId: FACILITY_ID, name: 'Rate Customer' });

    const commodity = await CommodityModel.create({
      id: 'cmd-rate-enforce',
      name: 'Potato Rate',
      normalizedName: 'potato rate enforce',
      isActive: true,
    });
    commodityId = commodity.id;
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
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        ...overrides,
      });
  }

  it('accepts matching controller rates', async () => {
    await CommodityRateModel.create({
      id: 'crt-enforce-1',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });

    const res = await postInbound({ smallBagPrice: 12, bigBagPrice: 18 });
    expect(res.status).toBe(201);
    expect(res.body.grn.smallBagPrice).toBe(12);
    expect(res.body.grn.bigBagPrice).toBe(18);
  });

  it('rejects stale or tampered rates when a controller row exists', async () => {
    await CommodityRateModel.create({
      id: 'crt-enforce-2',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });

    const res = await postInbound({ smallBagPrice: 10, bigBagPrice: 18 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('do not match the active Seasonal controller rate');
  });

  it('preserves the legacy path when no controller row exists', async () => {
    const res = await postInbound({ smallBagPrice: 10, bigBagPrice: 15 });
    expect(res.status).toBe(201);
    expect(res.body.grn.smallBagPrice).toBe(10);
  });

  it('rejects mismatched rates on correction when a controller row exists', async () => {
    await CommodityRateModel.create({
      id: 'crt-enforce-3',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });
    const created = await postInbound({ smallBagPrice: 12, bigBagPrice: 18 });
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/facilities/${FACILITY_ID}/grns/${created.body.grn.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ smallBagPrice: 9, reason: 'Rate correction attempt' });
    expect(res.status).toBe(400);
  });
});
