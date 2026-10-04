import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { SEASONAL_MONTHS } from './helpers/master-data-fixtures.js';
import {
  cleanupMultiFacilityScenario,
  seedMultiFacilityScenario,
  type MultiFacilityScenario,
} from './helpers/multi-facility-e2e-fixtures.js';

const app = createApp();
const CHAMBER_A = 'CA1';
const CHAMBER_B = 'CB1';

/**
 * Phase 11 multi-facility end-to-end: the isolation guard.
 *
 * Facility is the tenancy boundary and chamber is free text, so nothing about these guarantees
 * depends on a storage hierarchy: what must never leak is one facility's GRN, customer and
 * ledger data into another facility's view. The outward lifecycle (partial delivery, closure,
 * reversal, backup, audit trail) lives in e2e-multi-facility-lifecycle.test.ts.
 */
describe('Phase 11: Multi-Facility End-to-End — cross-facility isolation', () => {
  let scenario: MultiFacilityScenario;
  let grnIdA: string;
  let grnIdB: string;
  let grnNumberA: string;
  let grnNumberB: string;

  beforeAll(async () => {
    await connectToDatabase();
    scenario = await seedMultiFacilityScenario('e2eiso');
  }, 60000);

  afterAll(async () => {
    await cleanupMultiFacilityScenario(scenario);
    await disconnectDatabase();
  }, 60000);

  it('1. Bootstrap isolation: Super Admin sees both facilities; each tenant sees only its own', async () => {
    const superRes = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${scenario.tokens.superAdmin}`);
    expect(superRes.status).toBe(200);
    const superIds = superRes.body.items.map((f: { id: string }) => f.id);
    expect(superIds).toContain(scenario.facilityA);
    expect(superIds).toContain(scenario.facilityB);

    const adminARes = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`);
    expect(adminARes.status).toBe(200);
    const adminAIds = adminARes.body.items.map((f: { id: string }) => f.id);
    expect(adminAIds).toContain(scenario.facilityA);
    expect(adminAIds).not.toContain(scenario.facilityB);
  });

  it('2. Master-data scoping: Beta operator cannot read Alpha master data or register into Beta', async () => {
    const ownRes = await request(app)
      .get(`/api/facilities/${scenario.facilityA}`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.facility.id).toBe(scenario.facilityA);

    const deniedRes = await request(app)
      .get(`/api/facilities/${scenario.facilityA}`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorB}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.error).toContain('not authorized to access facility');

    // Customer listing is facility-derived, so an unscoped caller only ever sees its own tenant.
    const listRes = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(listRes.status).toBe(200);
    const customerIds = listRes.body.items.map((c: { id: string }) => c.id);
    expect(customerIds).toContain(scenario.customerA);
    expect(customerIds).not.toContain(scenario.customerB);

    const foreignQueryRes = await request(app)
      .get(`/api/customers?facilityId=${scenario.facilityB}`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(foreignQueryRes.status).toBe(403);

    const foreignRegisterRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`)
      .send({ name: 'Smuggled Customer', facilityId: scenario.facilityB });
    expect(foreignRegisterRes.status).toBe(403);
    expect(foreignRegisterRes.body.error).toContain('not authorized to register customer');
  });

  it('3. Concurrent inwarding: parallel GRNs in both facilities get independent FY sequences', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/facilities/${scenario.facilityA}/grns`)
        .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
        .send({
          customerId: scenario.customerA,
          commodityId: scenario.commodityId,
          chamber: CHAMBER_A,
          bags: 100,
          bagType: 'S',
          smallBagWeight: 50,
          rentType: 'Seasonal',
          rentAmount: 0,
        }),
      request(app)
        .post(`/api/facilities/${scenario.facilityB}/grns`)
        .set('Authorization', `Bearer ${scenario.tokens.operatorB}`)
        .send({
          customerId: scenario.customerB,
          commodityId: scenario.commodityId,
          chamber: CHAMBER_B,
          bags: 200,
          bagType: 'S',
          smallBagWeight: 50,
          rentType: 'Seasonal',
          rentAmount: 0,
        }),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    grnIdA = resA.body.grn.id;
    grnIdB = resB.body.grn.id;
    grnNumberA = resA.body.grn.grnNumber;
    grnNumberB = resB.body.grn.grnNumber;

    expect(grnIdA).not.toBe(grnIdB);
    expect(grnNumberA).toMatch(/^GRN-\d{2}-\d{2}-\d{4}$/);
    expect(grnNumberB).toMatch(/^GRN-\d{2}-\d{2}-\d{4}$/);
    expect(resA.body.grn.facilityId).toBe(scenario.facilityA);
    expect(resB.body.grn.facilityId).toBe(scenario.facilityB);
    expect(resA.body.grn.bags).toBe(100);
    expect(resB.body.grn.bags).toBe(200);

    // Each tenant owns its FY counter, so both receipts number from 0001 independently.
    const counters = await CounterModel.find({
      facilityId: { $in: [scenario.facilityA, scenario.facilityB] },
      counterType: 'GRN',
    });
    expect(counters).toHaveLength(2);
    expect(counters.map((c) => c.lastSequence)).toEqual([1, 1]);

    // Chamber is stored verbatim as free text on both receipts; Seasonal rent is the fixed period.
    expect(resA.body.grn.chamber).toBe(CHAMBER_A);
    expect(resB.body.grn.chamber).toBe(CHAMBER_B);
    expect(resA.body.grn.rentMonths).toBe(SEASONAL_MONTHS);
    expect(resB.body.grn.rentMonths).toBe(SEASONAL_MONTHS);
  });

  it('4. Facility scope guards GRN reads: Alpha operator cannot list or fetch Beta GRNs', async () => {
    const foreignListRes = await request(app)
      .get(`/api/facilities/${scenario.facilityB}/grns`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(foreignListRes.status).toBe(403);

    const foreignGetRes = await request(app)
      .get(`/api/grns/${grnIdB}`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(foreignGetRes.status).toBe(403);

    const ownListRes = await request(app)
      .get(`/api/facilities/${scenario.facilityA}/grns`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(ownListRes.status).toBe(200);
    expect(ownListRes.body.items.map((g: { id: string }) => g.id)).toContain(grnIdA);
    expect(ownListRes.body.items.map((g: { id: string }) => g.id)).not.toContain(grnIdB);
  });

  it('5. Put-away is whole-lot per GRN and ledger transactions stay facility-isolated', async () => {
    // Allocation takes no per-position item breakdown any more.
    const legacyItemsRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/grns/${grnIdA}/allocations`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ items: [{ positionId: 'pos-a1', bags: 100 }] });
    expect(legacyItemsRes.status).toBe(400);

    const [paA, paB] = await Promise.all([
      request(app)
        .post(`/api/facilities/${scenario.facilityA}/grns/${grnIdA}/allocations`)
        .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
        .send({ notes: 'Full put-away Alpha' }),
      request(app)
        .post(`/api/facilities/${scenario.facilityB}/grns/${grnIdB}/allocations`)
        .set('Authorization', `Bearer ${scenario.tokens.operatorB}`)
        .send({ notes: 'Full put-away Beta' }),
    ]);

    expect(paA.status).toBe(201);
    expect(paB.status).toBe(201);
    expect(paA.body.putAway.bags).toBe(100);
    expect(paB.body.putAway.bags).toBe(200);
    expect(paA.body.putAway.chamber).toBe(CHAMBER_A);
    expect(paB.body.summary.putAwayStatus).toBe('ALLOCATED');
    expect(paB.body.summary.unallocatedBags).toBe(0);

    const txA = await InventoryTransactionModel.find({
      facilityId: scenario.facilityA,
      grnId: grnIdA,
      transactionType: 'INWARD_PUTAWAY',
    });
    expect(txA).toHaveLength(1);
    expect(txA[0].quantity).toBe(100);
    expect(txA[0].chamber).toBe(CHAMBER_A);

    const txB = await InventoryTransactionModel.find({
      facilityId: scenario.facilityB,
      grnId: grnIdB,
      transactionType: 'INWARD_PUTAWAY',
    });
    expect(txB).toHaveLength(1);
    expect(txB[0].quantity).toBe(200);
    expect(txB[0].chamber).toBe(CHAMBER_B);
  });

  it('6. Cross-facility outward denial: Alpha operator cannot move Beta stock and is audited', async () => {
    const crossRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/deliveries`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ grnId: grnIdB, bags: 10 });
    expect(crossRes.status).toBe(404);

    const deniedScopeRes = await request(app)
      .post(`/api/facilities/${scenario.facilityB}/deliveries`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ grnId: grnIdB, bags: 10 });
    expect(deniedScopeRes.status).toBe(403);

    // Audit writes are fire-and-forget; allow the async write to settle.
    await new Promise((r) => setTimeout(r, 500));
    const auditDenied = await AuditLogModel.findOne({
      eventType: 'ACCESS_DENIED',
      userId: scenario.userIds[2],
      facilityId: scenario.facilityB,
    });
    expect(auditDenied).not.toBeNull();
  });
});
