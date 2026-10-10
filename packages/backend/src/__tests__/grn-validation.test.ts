import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { SEASONAL_MONTHS, seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';
import { nextTestGrnNumber } from './helpers/grn-number-fixtures.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const northFacilityId = 'fac-north-rel-val';
const southFacilityId = 'fac-south-rel-val';

describe('GRN Relational Validation & Business Constraints', () => {
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;

  let customerNorthId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: adminNorthToken } = await seedAuth({
      userId: 'usr-val-an',
      username: 'val.admin.north',
      role: 'ADMIN',
      facilityIds: [northFacilityId],
    }));
    ({ token: adminSouthToken } = await seedAuth({
      userId: 'usr-val-as',
      username: 'val.admin.south',
      role: 'ADMIN',
      facilityIds: [southFacilityId],
    }));
    ({ token: operatorNorthToken } = await seedAuth({
      userId: 'usr-val-on',
      username: 'val.op.north',
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: northFacilityId, code: 'NORTHV', name: 'North Cold Facility' });
    await seedFacility({ id: southFacilityId, code: 'SOUTHV', name: 'South Cold Facility' });

    customerNorthId = await seedCustomer({
      id: 'cust-ramesh-val',
      facilityId: northFacilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-val',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti val',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  function postInbound(
    token: string,
    facilityId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        grnNumber: nextTestGrnNumber(),
        customerId: customerNorthId,
        commodityId,
        chamber: 'CH-NORTH-01',
        bags: 50,
        bagType: 'S',
        smallBagWeight: 50,
        bigBagWeight: 80,
        rentType: 'Seasonal',
        rentAmount: 500,
        ...overrides,
      });
  }

  it('rejects customer not registered for the target facility', async () => {
    const res = await postInbound(adminSouthToken, southFacilityId);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not registered for facility');
  });

  it('rejects an inactive customer even when registered for the facility', async () => {
    const inactiveCustomerId = await seedCustomer({
      id: 'cust-sita-val',
      facilityId: northFacilityId,
      name: 'Sita Devi',
      isActive: false,
    });

    const res = await postInbound(adminNorthToken, northFacilityId, {
      customerId: inactiveCustomerId,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is inactive');
  });

  it('rejects an inactive commodity', async () => {
    await CommodityModel.updateOne({ id: commodityId }, { isActive: false });

    const res = await postInbound(adminNorthToken, northFacilityId);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is inactive');
  });

  it('rejects an unknown commodity', async () => {
    const res = await postInbound(adminNorthToken, northFacilityId, {
      commodityId: 'cmd-does-not-exist',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });

  it('enforces conditional rent terms: Monthly allows optional count (>=1 if provided), Seasonal must omit months', async () => {
    const monthlyMissing = await postInbound(operatorNorthToken, northFacilityId, {
      rentType: 'Monthly',
    });
    expect(monthlyMissing.status).toBe(201);
    expect(monthlyMissing.body.grn.rentMonths).toBeNull();

    const monthlyZero = await postInbound(operatorNorthToken, northFacilityId, {
      rentType: 'Monthly',
      rentMonths: 0,
    });
    expect(monthlyZero.status).toBe(400);
    expect(monthlyZero.body.details.fieldErrors.rentMonths).toBeDefined();

    const monthlyValid = await postInbound(operatorNorthToken, northFacilityId, {
      rentType: 'Monthly',
      rentMonths: 3,
    });
    expect(monthlyValid.status).toBe(201);
    expect(monthlyValid.body.grn.rentMonths).toBe(3);

    const seasonalWithMonths = await postInbound(operatorNorthToken, northFacilityId, {
      rentType: 'Seasonal',
      rentMonths: 3,
    });
    expect(seasonalWithMonths.status).toBe(400);
    expect(seasonalWithMonths.body.details.fieldErrors.rentMonths).toBeDefined();

    const seasonalValid = await postInbound(operatorNorthToken, northFacilityId);
    expect(seasonalValid.status).toBe(201);
    expect(seasonalValid.body.grn.rentMonths).toBe(SEASONAL_MONTHS);
  });

  it('rejects a future inward date', async () => {
    const res = await postInbound(operatorNorthToken, northFacilityId, {
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.fieldErrors.date).toBeDefined();
  });

  it('validates the free-text chamber label instead of resolving a storage entity', async () => {
    const tooLong = await postInbound(operatorNorthToken, northFacilityId, {
      chamber: 'C'.repeat(21),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.details.fieldErrors.chamber).toBeDefined();

    const blank = await postInbound(operatorNorthToken, northFacilityId, { chamber: '   ' });
    expect(blank.status).toBe(400);
    expect(blank.body.details.fieldErrors.chamber).toBeDefined();

    const arbitraryLabel = await postInbound(operatorNorthToken, northFacilityId, {
      chamber: 'A',
    });
    expect(arbitraryLabel.status).toBe(201);
    expect(arbitraryLabel.body.grn.chamber).toBe('A');
  });

  it('ignores a legacy chamberId payload and stores the free-text chamber', async () => {
    const res = await postInbound(operatorNorthToken, northFacilityId, {
      chamber: 'CH-LEGACY-IGNORED',
      chamberId: 'cham-north-val',
    });

    expect(res.status).toBe(201);
    expect(res.body.grn.chamber).toBe('CH-LEGACY-IGNORED');
    expect(res.body.grn.chamberId).toBeUndefined();
  });
});
