import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { SEASONAL_MONTHS, seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const northFacilityId = 'fac-north-retrieval';

describe('GRN Retrieval & Acknowledgement Projections', () => {
  let operatorNorthToken: string;
  let customerNorthId: string;
  let commodityId: string;
  let createdGrnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: operatorNorthToken } = await seedAuth({
      userId: 'usr-grn-ret-op',
      username: 'ret.op.north',
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: northFacilityId, code: 'NORTHR', name: 'North Cold Facility' });

    customerNorthId = await seedCustomer({
      id: 'cust-ramesh-ret',
      facilityId: northFacilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-ret',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti ret',
      isActive: true,
    });
    commodityId = commodity.id;

    const res = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamber: 'CH-NORTH-01',
        bags: 120,
        bagType: 'S+B',
        smallBags: 70,
        bigBags: 50,
        smallBagWeight: 50,
        bigBagWeight: 80,
        rentType: 'Seasonal',
        rentAmount: 1800,
      });
    createdGrnId = res.body.grn.id;
  });

  it('retrieves single GRN by ID', async () => {
    const res = await request(app)
      .get(`/api/grns/${createdGrnId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.grn.id).toBe(createdGrnId);
    expect(res.body.grn.bags).toBe(120);
    expect(res.body.grn.chamber).toBe('CH-NORTH-01');
  });

  it('retrieves Inward Acknowledgement projection by GRN ID', async () => {
    const res = await request(app)
      .get(`/api/grns/${createdGrnId}/acknowledgement`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.acknowledgement.grnId).toBe(createdGrnId);
    expect(res.body.acknowledgement.bagAccounting.bags).toBe(120);
    expect(res.body.acknowledgement.bagAccounting.bagType).toBe('S+B');
    expect(res.body.acknowledgement.rentTerms.rentType).toBe('Seasonal');
    expect(res.body.acknowledgement.rentTerms.rentMonths).toBe(SEASONAL_MONTHS);
    expect(res.body.acknowledgement.storageLocation.chamber).toBe('CH-NORTH-01');
  });

  it('lists GRNs for facility with filtering and pagination', async () => {
    const res = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns?page=1&limit=10`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('filters the facility list by the free-text chamber label', async () => {
    await seedGrn({
      facilityId: northFacilityId,
      customerId: customerNorthId,
      commodityId,
      commodityName: 'Potato Jyoti',
      chamber: 'CH-NORTH-02',
      bags: 30,
      rentAmount: 900,
    });

    const hit = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns?chamber=CH-NORTH-01`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(hit.status).toBe(200);
    expect(hit.body.total).toBe(1);
    expect(hit.body.items[0].id).toBe(createdGrnId);
    expect(hit.body.items[0].chamber).toBe('CH-NORTH-01');

    const miss = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns?chamber=CH-NORTH-99`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(miss.status).toBe(200);
    expect(miss.body.total).toBe(0);
  });
});
