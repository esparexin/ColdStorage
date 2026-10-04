import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedGrn } from './helpers/master-data-fixtures.js';

/**
 * Facility lifecycle: create, deactivate, list filtering, and deletion.
 *
 * Deletion is a hard delete because this repository has no soft-delete mechanism, and it is
 * refused while operational records still reference the facility.
 */
describe('Facility Lifecycle', () => {
  const app = createApp();
  const seedUser = createAuthSeeder(config.jwtSecret);

  let superAdminToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await connectToDatabase();

    [{ token: superAdminToken }, { token: adminToken }] = await Promise.all([
      seedUser({
        userId: 'usr-fac-superadmin',
        username: 'fac.superadmin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
      }),
      seedUser({
        userId: 'usr-fac-admin',
        username: 'fac.admin',
        role: 'ADMIN',
        facilityIds: [],
      }),
    ]);
  });

  afterAll(async () => {
    await FacilityModel.deleteMany({ code: /^LIFECYCLE-/ });
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({ code: /^LIFECYCLE-/ });
  });

  const createFacility = async (overrides: Record<string, unknown> = {}) => {
    const res = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Lifecycle Test Facility',
        code: `LIFECYCLE-${randomUUID().slice(0, 6).toUpperCase()}`,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.facility as { id: string; code: string; isActive: boolean };
  };

  it('omits deactivated facilities from the default list but includes them on request', async () => {
    const active = await createFacility({ name: 'Lifecycle Active' });
    const inactive = await createFacility({ name: 'Lifecycle Inactive' });

    await request(app)
      .patch(`/api/facilities/${inactive.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false })
      .expect(200);

    const defaultList = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const defaultIds = (defaultList.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(defaultIds).toContain(active.id);
    expect(defaultIds).not.toContain(inactive.id);

    const withInactive = await request(app)
      .get('/api/facilities?includeInactive=true')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const withInactiveIds = (withInactive.body.items as Array<{ id: string }>).map((f) => f.id);
    expect(withInactiveIds).toContain(active.id);
    expect(withInactiveIds).toContain(inactive.id);
  });

  it('deletes a facility that has no operational history', async () => {
    const facility = await createFacility({ name: 'Lifecycle Disposable' });

    const res = await request(app)
      .delete(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const after = await request(app)
      .get(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(after.status).toBe(404);
  });

  it('refuses to delete a facility that still has inward receipts', async () => {
    const facility = await createFacility({ name: 'Lifecycle With History' });
    await seedGrn({ facilityId: facility.id });

    const res = await request(app)
      .delete(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('inward receipts');

    const still = await request(app)
      .get(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(still.status).toBe(200);
  });

  it('refuses deletion for a role without settings:manage and returns 404 for unknown ids', async () => {
    const facility = await createFacility({ name: 'Lifecycle RBAC' });

    const denied = await request(app)
      .delete(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toContain("Role 'ADMIN' lacks permission 'settings:manage'");

    const missing = await request(app)
      .delete('/api/facilities/fac-does-not-exist')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(missing.status).toBe(404);
  });

  it('rejects unknown keys on create and update instead of silently dropping them', async () => {
    const created = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Lifecycle Strict', code: `LIFECYCLE-${randomUUID().slice(0, 6).toUpperCase()}`, is_active: false });
    expect(created.status).toBe(400);

    const facility = await createFacility({ name: 'Lifecycle Strict Update' });
    const patched = await request(app)
      .patch(`/api/facilities/${facility.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ nam: 'typo' });
    expect(patched.status).toBe(400);
  });

  it('reports a duplicate facility code as a conflict rather than a bad request', async () => {
    const facility = await createFacility({ name: 'Lifecycle Duplicate' });

    const res = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Lifecycle Duplicate Twin', code: facility.code });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });
});