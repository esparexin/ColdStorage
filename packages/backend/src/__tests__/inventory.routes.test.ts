import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seed = createAuthSeeder(config.jwtSecret);

const facilityId = 'fac-routes-1';
const otherFacilityId = 'fac-routes-2';

describe('P5 Inventory Routes & RBAC Integration Tests', () => {
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: operatorToken } = await seed({
      userId: 'usr-inv-op',
      username: 'operator_main',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
    ({ token: readOnlyToken } = await seed({
      userId: 'usr-inv-ro',
      username: 'readonly_main',
      role: 'READ_ONLY',
      facilityIds: [facilityId],
    }));
    ({ token: otherFacilityOperatorToken } = await seed({
      userId: 'usr-inv-op-other',
      username: 'operator_other',
      role: 'OPERATOR',
      facilityIds: [otherFacilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: facilityId, name: 'Main Facility' });
    await seedFacility({ id: otherFacilityId, name: 'Other Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Kisan Traders' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-1',
      bags: 80,
      commodityName: 'Onions',
      grnNumber: 'GRN-25-26-0001',
    });
  });

  it('returns 404 for obsolete put-away allocations endpoint', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ notes: 'Operator allocation' });

    expect(res.status).toBe(404);
  });

  it('enforces facility-scoped isolation (user cannot access other facility)', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/inventory-summary`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection (rejects mismatched grnId)', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/grns/non-existent-grn/inventory-summary`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in facility');
  });

  it('allows querying GRN inventory summary derived directly from GRN SSOT', async () => {
    const sumRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/inventory-summary`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(sumRes.status).toBe(200);
    expect(sumRes.body.summary.chamber).toBe('CH-1');
    expect(sumRes.body.summary.totalBags).toBe(80);
  });

  it('allows querying facility stock aggregated by commodity and chamber directly from GRN', async () => {
    const facRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(facRes.status).toBe(200);
    expect(facRes.body.summary.totalStockBags).toBe(80);
    expect(facRes.body.summary.byCommodity[0].totalBags).toBe(80);
    expect(facRes.body.summary.byChamber).toEqual([{ chamber: 'CH-1', totalBags: 80 }]);
  });

  it('allows querying filtered paginated stock ledger by chamber', async () => {
    const ledgerRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory/ledger?grnId=${grnId}&chamber=CH-1&page=1&limit=10`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.page).toBe(1);

    const missRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory/ledger?chamber=CH-99`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(missRes.status).toBe(200);
    expect(missRes.body.total).toBe(0);
  });
});
