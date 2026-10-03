import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { GrnModel } from '../database/models/grn.model.js';
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

  it('allows OPERATOR to perform a whole-lot put-away allocation', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ notes: 'Operator allocation' });

    expect(res.status).toBe(201);
    expect(res.body.putAway.bags).toBe(80);
    expect(res.body.putAway.chamber).toBe('CH-1');
    expect(res.body.putAway.allocatedBy).toBe('usr-inv-op');
    expect(res.body.summary.chamber).toBe('CH-1');
    expect(res.body.summary.allocatedBags).toBe(80);
    expect(res.body.summary.unallocatedBags).toBe(0);
    expect(res.body.summary.putAwayStatus).toBe('ALLOCATED');
  });

  it("rejects READ_ONLY user from performing put-away allocation (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ notes: 'Read only attempt' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("lacks permission 'allocation:manage'");
  });

  it('enforces facility-scoped isolation (user cannot access other facility)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection (rejects mismatched grnId)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/non-existent-grn/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in facility');
  });

  it('rejects a legacy position-item allocation payload (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ items: [{ positionId: 'pos-routes-1', bags: 20 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('allows querying GRN allocation history and inventory summary', async () => {
    const allocRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ notes: 'Full lot' });
    expect(allocRes.status).toBe(201);

    const histRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.allocations).toHaveLength(1);
    expect(histRes.body.allocations[0].bags).toBe(80);
    expect(histRes.body.allocations[0].chamber).toBe('CH-1');

    const sumRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/inventory-summary`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(sumRes.status).toBe(200);
    expect(sumRes.body.summary.chamber).toBe('CH-1');
    expect(sumRes.body.summary.allocatedBags).toBe(80);
    expect(sumRes.body.summary.unallocatedBags).toBe(0);
    expect(sumRes.body.summary.putAwayStatus).toBe('ALLOCATED');
  });

  it('allows querying facility stock aggregated by commodity and chamber', async () => {
    await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});

    const facRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(facRes.status).toBe(200);
    expect(facRes.body.summary.totalStockBags).toBe(80);
    expect(facRes.body.summary.byCommodity[0].totalBags).toBe(80);
    expect(facRes.body.summary.byChamber).toEqual([{ chamber: 'CH-1', totalBags: 80 }]);
  });

  it('allows querying filtered paginated stock ledger by chamber', async () => {
    await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});

    const ledgerRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory/ledger?grnId=${grnId}&chamber=CH-1&page=1&limit=10`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.total).toBe(1);
    expect(ledgerRes.body.items[0].quantity).toBe(80);
    expect(ledgerRes.body.items[0].chamber).toBe('CH-1');
    expect(ledgerRes.body.items[0].transactionType).toBe('INWARD_PUTAWAY');

    const missRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory/ledger?chamber=CH-99`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(missRes.status).toBe(200);
    expect(missRes.body.total).toBe(0);
  });

  it('blocks put-away with 402 when rent is unpaid', async () => {
    const unpaidGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-2',
      bags: 40,
      rentAmount: 5000,
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${unpaidGrnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('RENT_PAYMENT_REQUIRED');
    expect(res.body.rent.remainingBalance).toBe(5000);
  });

  it('rejects put-away for a CLOSED GRN with 400', async () => {
    await GrnModel.updateOne({ id: grnId }, { $set: { status: 'CLOSED' } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is not OPEN');
  });
});
