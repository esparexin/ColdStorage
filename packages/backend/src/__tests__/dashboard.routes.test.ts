import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedLedgerEntry } from './helpers/ledger-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P7 Dashboard Routes & Authorization Integration Tests
 *
 * Scope: HTTP authentication, RBAC (`dashboard:view`), facility authorization, cross-facility
 * rejection, and verification that DashboardService is not called after an authorization failure.
 *
 * NOT in scope here: stock/KPI derivation (dashboard.service.test.ts).
 */

const app = createApp();

describe('P7 Dashboard Routes & Authorization', () => {
  const facilityId = 'fac-dash-routes-1';
  const otherFacilityId = 'fac-dash-routes-2';

  let superAdminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityToken: string;
  let mustChangePasswordToken: string;

  const dashboardUrl = `/api/facilities/${facilityId}/dashboard/summary`;

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    await connectToDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'usr-dash-sa',
      username: 'dash_superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));

    ({ token: operatorToken } = await seed({
      userId: 'usr-dash-op',
      username: 'dash_operator',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));

    ({ token: readOnlyToken } = await seed({
      userId: 'usr-dash-ro',
      username: 'dash_readonly',
      role: 'READ_ONLY',
      facilityIds: [facilityId],
    }));

    ({ token: otherFacilityToken } = await seed({
      userId: 'usr-dash-other',
      username: 'dash_other_facility',
      role: 'OPERATOR',
      facilityIds: [otherFacilityId],
    }));

    ({ token: mustChangePasswordToken } = await seed({
      userId: 'usr-dash-pwd',
      username: 'dash_must_change',
      role: 'OPERATOR',
      facilityIds: [facilityId],
      mustChangePassword: true, // triggers requirePasswordChanged gate
    }));
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});

    // No storage hierarchy to seed: chamber is a free-text label on the ledger itself.
    await seedFacility({ id: facilityId, name: 'Main Facility', code: 'MAIN' });
    await seedFacility({ id: otherFacilityId, name: 'Other Facility', code: 'OTHR' });
    await seedGrn({ facilityId, chamber: 'CH-1', bags: 300, status: 'OPEN' });
    await seedLedgerEntry({ facilityId, chamber: 'CH-1', quantity: 300 });
  });

  // 1. Unauthenticated request → 401
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(dashboardUrl);
    expect(res.status).toBe(401);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  // 2. Password change gate → 403
  it('returns 403 when mustChangePassword is true', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(res.status).toBe(403);
  });

  // 3. dashboard:view permission — all four roles must be allowed
  it('allows SUPER_ADMIN to access the dashboard', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });

  it('allows OPERATOR with facility access to access the dashboard', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });

  it('allows READ_ONLY with facility access to access the dashboard', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });

  // 4. Cross-facility / unauthorized facility → 403 from requireFacilityScope
  it('returns 403 when user is authorized for a different facility (cross-facility rejection)', async () => {
    const res = await request(app)
      .get(dashboardUrl) // requesting facilityId
      .set('Authorization', `Bearer ${otherFacilityToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when requesting another facility the user is not assigned to', async () => {
    const res = await request(app)
      .get(`/api/facilities/${otherFacilityId}/dashboard/summary`)
      .set('Authorization', `Bearer ${operatorToken}`); // operator is only for facilityId
    expect(res.status).toBe(403);
  });

  // 5. DashboardService must not be called after authorization failure
  it('does not invoke DashboardService when unauthenticated', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app).get(dashboardUrl);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not invoke DashboardService on cross-facility rejection', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app).get(dashboardUrl).set('Authorization', `Bearer ${otherFacilityToken}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not invoke DashboardService when mustChangePassword is true', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app).get(dashboardUrl).set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // 6. Response structure on success — the current DashboardSummary contract only
  it('returns a summary carrying exactly the current contract keys on success', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);

    const summary = res.body.summary as Record<string, unknown>;
    expect(summary.facilityId).toBe(facilityId);
    expect(summary.totalStockBags).toBe(300);
    expect(summary.activeGrns).toBe(1);
    expect(summary.closedGrns).toBe(0);
    expect(typeof summary.monthlyInwardBags).toBe('number');
    expect(typeof summary.monthlyDeliveredBags).toBe('number');
    expect(Array.isArray(summary.chamberStock)).toBe(true);
    expect(Array.isArray(summary.commodityBreakdown)).toBe(true);
    expect(Array.isArray(summary.recentActivity)).toBe(true);
    expect(typeof summary.generatedAt).toBe('string');

    // The strict schema rejects these, so the wire payload must not carry them either.
    expect(summary).not.toHaveProperty('totalCapacityBags');
    expect(summary).not.toHaveProperty('occupiedBags');
    expect(summary).not.toHaveProperty('availableBags');
    expect(summary).not.toHaveProperty('utilizationRate');
    expect(summary).not.toHaveProperty('chamberUtilization');
  });

  it('exposes chamberStock grouped by the free-text chamber label', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.chamberStock).toEqual([{ chamber: 'CH-1', totalBags: 300 }]);
  });

  it('exposes recentActivity with a chamber label and no positionCode', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    const [activity] = res.body.summary.recentActivity as Array<Record<string, unknown>>;
    expect(activity.type).toBe('INWARD_PUTAWAY');
    expect(activity.chamber).toBe('CH-1');
    expect(activity).not.toHaveProperty('positionCode');
  });
});
