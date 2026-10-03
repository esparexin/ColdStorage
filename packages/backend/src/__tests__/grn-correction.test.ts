import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const facilityId = 'fac-north-correct';

/**
 * Chamber is free text and the ledger is immutable, so an inward receipt may only be corrected
 * by the `grn:correct` workflow, and only while nothing has moved against it.
 */
describe('GRN Correction Workflow (PATCH /api/facilities/:facilityId/grns/:grnId)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: adminToken } = await seedAuth({
      userId: 'usr-correct-admin',
      username: 'grn.correct.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: facilityId, code: 'CORRECT', name: 'North Cold Facility' });
    customerId = await seedCustomer({
      id: 'cust-correct',
      facilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-correct',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti correct',
      isActive: true,
    });
    commodityId = commodity.id;

    grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId,
      commodityName: 'Potato Jyoti',
      chamber: 'CH-01',
      bags: 200,
      rentAmount: 5000,
    });
  });

  function correct(body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  /** Reads the receipt back through the read API, which is the record the ledger now agrees with. */
  function storedGrn() {
    return request(app)
      .get(`/api/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  it('corrects commodity, bag count and chamber on an OPEN receipt', async () => {
    await GrnModel.updateOne(
      { id: grnId },
      { $set: { nominalUnitWeight: 50, nominalTotalWeight: 10000, authoritativeWeight: 10000 } },
    );
    await CommodityModel.create({
      id: 'cmd-onion-correct',
      name: 'Onion Nashik',
      normalizedName: 'onion nashik correct',
      isActive: true,
    });

    const res = await correct({
      commodityId: 'cmd-onion-correct',
      bags: 180,
      chamber: '  CH-07  ',
      reason: 'Operator mis-keyed the lot at inward',
    });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.status).toBe(200);
    expect(stored.body.grn.commodityId).toBe('cmd-onion-correct');
    expect(stored.body.grn.commodityName).toBe('Onion Nashik');
    expect(stored.body.grn.bags).toBe(180);
    expect(stored.body.grn.chamber).toBe('CH-07');
    // Rent terms are financial facts and are not correctable through this workflow.
    expect(stored.body.grn.rentAmount).toBe(5000);
    expect(stored.body.grn.rentType).toBe('Seasonal');
    expect(stored.body.grn.status).toBe('OPEN');
  });

  it('requires a correction reason of at least 5 characters', async () => {
    const res = await correct({ bags: 180, reason: 'fix' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.fieldErrors.reason).toBeDefined();
  });

  it('requires at least one correctable field and rejects unknown keys', async () => {
    const noField = await correct({ reason: 'Nothing actually changes here' });
    expect(noField.status).toBe(400);

    const unknownKey = await correct({ rentAmount: 1, reason: 'Trying to change the rent' });
    expect(unknownKey.status).toBe(400);
    expect(unknownKey.body.error).toBe('Validation failed');
  });

  it('rejects a correction naming an inactive commodity', async () => {
    await CommodityModel.updateOne({ id: commodityId }, { isActive: false });

    const res = await correct({ commodityId, reason: 'Re-keying the commodity' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('is inactive');
  });

  it('refuses to correct a CLOSED receipt', async () => {
    await GrnModel.updateOne({ id: grnId }, { $set: { status: 'CLOSED' } });

    const res = await correct({ bags: 180, reason: 'Stock already fully delivered' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('it is CLOSED');
  });

  it('refuses to correct a receipt whose stock has already been allocated', async () => {
    await PutAwayAllocationModel.create({
      id: `pa-${randomUUID()}`,
      facilityId,
      grnId,
      grnNumber: 'GRN-26-27-0001',
      chamber: 'CH-01',
      bags: 200,
      notes: null,
      allocatedBy: 'usr-correct-admin',
      allocatedAt: new Date(),
    });

    const res = await correct({ bags: 180, reason: 'Re-counting after allocation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('stock has already been allocated or delivered');
  });

  it('refuses to correct a receipt with any non-inward inventory movement', async () => {
    await InventoryTransactionModel.create({
      id: `it-${randomUUID()}`,
      facilityId,
      grnId,
      grnNumber: 'GRN-26-27-0001',
      chamber: 'CH-01',
      customerId,
      commodityId,
      bagType: 'S',
      transactionType: 'OUTWARD_DELIVERY',
      quantity: 60,
      referenceType: 'DELIVERY',
      referenceId: 'chl-correct-1',
      notes: null,
      createdBy: 'usr-correct-admin',
      createdAt: new Date(),
    });

    const res = await correct({ chamber: 'CH-09', reason: 'Relabelling after a delivery' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('stock has already been allocated or delivered');
  });

  it('still corrects a receipt whose only movement is the original inward put-away', async () => {
    await InventoryTransactionModel.create({
      id: `it-${randomUUID()}`,
      facilityId,
      grnId,
      grnNumber: 'GRN-26-27-0001',
      chamber: 'CH-01',
      customerId,
      commodityId,
      bagType: 'S',
      transactionType: 'INWARD_PUTAWAY',
      quantity: 200,
      referenceType: 'PUT_AWAY',
      referenceId: 'pa-correct-1',
      notes: null,
      createdBy: 'usr-correct-admin',
      createdAt: new Date(),
    });

    const res = await correct({ chamber: 'CH-09', reason: 'Relabelling before any outward' });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.body.grn.chamber).toBe('CH-09');
  });
});
