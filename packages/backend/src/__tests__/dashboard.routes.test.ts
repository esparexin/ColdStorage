import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { generateAccessToken } from '../utils/crypto.js';

/**
 * P7 Dashboard Routes & Authorization Integration Tests
 *
 * Scope: HTTP authentication, RBAC, facility authorization, cross-facility
 * rejection, and verification that DashboardService is not called after an
 * authorization failure.
 *
 * NOT in scope here: KPI calculations, ledger polarity, recent activity
 * projection. Those belong in dashboard.service.test.ts.
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

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    superAdminToken = generateAccessToken(
      {
        userId: 'usr-dash-sa',
        username: 'dash_superadmin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
        mustChangePassword: false,
      },
      config.jwtSecret,
    );

    operatorToken = generateAccessToken(
      {
        userId: 'usr-dash-op',
        username: 'dash_operator',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        mustChangePassword: false,
      },
      config.jwtSecret,
    );

    readOnlyToken = generateAccessToken(
      {
        userId: 'usr-dash-ro',
        username: 'dash_readonly',
        role: 'READ_ONLY',
        facilityIds: [facilityId],
        mustChangePassword: false,
      },
      config.jwtSecret,
    );

    otherFacilityToken = generateAccessToken(
      {
        userId: 'usr-dash-other',
        username: 'dash_other_facility',
        role: 'OPERATOR',
        facilityIds: [otherFacilityId],
        mustChangePassword: false,
      },
      config.jwtSecret,
    );

    mustChangePasswordToken = generateAccessToken(
      {
        userId: 'usr-dash-pwd',
        username: 'dash_must_change',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        mustChangePassword: true, // triggers requirePasswordChanged gate
      },
      config.jwtSecret,
    );
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await PositionModel.deleteMany({});

    // Facilities
    await FacilityModel.create({ id: facilityId, name: 'Main Facility', code: 'MAIN', isActive: true });
    await FacilityModel.create({ id: otherFacilityId, name: 'Other Facility', code: 'OTHR', isActive: true });

    // Minimal storage hierarchy so the service returns a valid response
    await ChamberModel.create({ id: 'ch-route-1', facilityId, chamberNumber: 'CH-1', isActive: true });
    await PositionModel.create({
      id: 'pos-route-1',
      facilityId,
      chamberId: 'ch-route-1',
      rackId: 'rk-1',
      levelId: 'lvl-1',
      code: 'P1',
      capacityBags: 100,
      isActive: true,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Unauthenticated request → 401
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 2. Password change gate → 403
  // ---------------------------------------------------------------------------
  it('returns 403 when mustChangePassword is true', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 3. dashboard:view permission — all four roles must be allowed
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 4. Cross-facility / unauthorized facility → 403 from requireFacilityScope
  // ---------------------------------------------------------------------------
  it('returns 403 when user is authorized for a different facility (cross-facility rejection)', async () => {
    // otherFacilityToken is for otherFacilityId only
    const res = await request(app)
      .get(dashboardUrl) // requesting facilityId
      .set('Authorization', `Bearer ${otherFacilityToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when requesting another facility the user is not assigned to', async () => {
    const otherFacilityUrl = `/api/facilities/${otherFacilityId}/dashboard/summary`;
    const res = await request(app)
      .get(otherFacilityUrl)
      .set('Authorization', `Bearer ${operatorToken}`); // operator is only for facilityId
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 5. DashboardService must not be called after authorization failure
  // ---------------------------------------------------------------------------
  it('does not invoke DashboardService when unauthenticated', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app).get(dashboardUrl);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not invoke DashboardService on cross-facility rejection', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${otherFacilityToken}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not invoke DashboardService when mustChangePassword is true', async () => {
    const spy = vi.spyOn(dashboardService, 'getSummary');
    await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // 6. Response structure on success
  // ---------------------------------------------------------------------------
  it('returns summary with facilityId on success', async () => {
    const res = await request(app)
      .get(dashboardUrl)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.facilityId).toBe(facilityId);
    expect(typeof res.body.summary.totalCapacityBags).toBe('number');
    expect(typeof res.body.summary.utilizationRate).toBe('number');
    expect(Array.isArray(res.body.summary.chamberUtilization)).toBe(true);
    expect(Array.isArray(res.body.summary.recentActivity)).toBe(true);
  });
});
