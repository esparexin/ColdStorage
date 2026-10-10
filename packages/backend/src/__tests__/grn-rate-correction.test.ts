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

const FACILITY_ID = 'fac-rate-correct';

/**
 * Fail-closed correction-path enforcement (B5/B6/B7): touched rate fields and
 * agreement switches re-validate against final values; untouched history is
 * never checked; explicit lump sums must match the SSOT derivation.
 */
describe('GRN correction rate enforcement — grn-rate-correction.test.ts', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-rate-correct',
      username: 'rate.correct.admin',
      role: 'ADMIN',
      facilityIds: [FACILITY_ID],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});

    await seedFacility({ id: FACILITY_ID, code: 'CORR', name: 'Correct Facility' });
    customerId = await seedCustomer({ id: 'cust-corr', facilityId: FACILITY_ID, name: 'Correct Customer' });

    const commodity = await CommodityModel.create({
      id: 'cmd-rate-correct',
      name: 'Potato Correct',
      normalizedName: 'potato correct enforce',
      isActive: true,
    });
    commodityId = commodity.id;
    await CommodityModel.create({
      id: 'cmd-rate-other',
      name: 'Potato Other',
      normalizedName: 'potato other correct',
      isActive: true,
    });
    await CommodityRateModel.create({
      id: `crt-corr-base-${Math.floor(Math.random() * 1e6)}`,
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });
    await CommodityRateModel.create({
      id: `crt-corr-other-${Math.floor(Math.random() * 1e6)}`,
      commodityId: 'cmd-rate-other',
      rentType: 'Seasonal',
      smallRate: 20,
      bigRate: 25,
      isActive: true,
    });
  });

  async function createControlledGrn() {
    const created = await request(app)
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
        smallBagPrice: 12,
        bigBagPrice: 18,
      });
    expect(created.status).toBe(201);
    return created.body.grn.id as string;
  }

  function patchGrn(grnId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/facilities/${FACILITY_ID}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  it('rejects bagPrice-only edits contradicting the controller pair (B5)', async () => {
    const res = await patchGrn(await createControlledGrn(), { bagPrice: 99, reason: 'Tampered single rate' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('controller rate');
  });

  it('accepts bagPrice-only edits matching the bag-type side', async () => {
    const res = await patchGrn(await createControlledGrn(), { bagPrice: 12, reason: 'Record single rate' });
    expect(res.status).toBe(200);
    expect(res.body.grn.bagPrice).toBe(12);
  });

  it('rejects lump-sum overrides contradicting the derived obligation (B6)', async () => {
    const res = await patchGrn(await createControlledGrn(), { rentAmount: 9999, reason: 'Inflated obligation' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('contradicts the derived');
  });

  it('accepts lump sums equal to the derived obligation', async () => {
    const res = await patchGrn(await createControlledGrn(), { rentAmount: 1200, reason: 'Confirm obligation' });
    expect(res.status).toBe(200);
    expect(res.body.grn.rentAmount).toBe(1200);
  });

  it('rejects commodity switches that leave stale rates behind (B7)', async () => {
    const res = await patchGrn(await createControlledGrn(), { commodityId: 'cmd-rate-other', reason: 'Change commodity' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('controller rate');
  });

  it('accepts commodity switches resubmitting the new commodity rates', async () => {
    const res = await patchGrn(await createControlledGrn(), {
      commodityId: 'cmd-rate-other',
      smallBagPrice: 20,
      bigBagPrice: 25,
      reason: 'Change commodity with rates',
    });
    expect(res.status).toBe(200);
    expect(res.body.grn.commodityId).toBe('cmd-rate-other');
    expect(res.body.grn.smallBagPrice).toBe(20);
    expect(res.body.grn.bigBagPrice).toBe(25);
  });
});
