import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedFacility } from './helpers/master-data-fixtures.js';

const app = createApp();

/**
 * Master-data and facility RBAC.
 *
 * Facility is the tenancy root and the only managed master-data entity left, so this suite
 * covers customer and commodity writes plus the facility read/write split: reads need
 * `facility:view` (every role, still facility-scoped), writes need `settings:manage`, which
 * only SUPER_ADMIN holds — ADMIN and OPERATOR are denied.
 */
describe('Master Data & Facility Scoping RBAC', () => {
  const seedUser = createAuthSeeder(config.jwtSecret);

  let superAdminToken: string;
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;

  let northFacilityId: string;
  let southFacilityId: string;

  beforeAll(async () => {
    await connectToDatabase();
    northFacilityId = `fac-north-${randomUUID().slice(0, 8)}`;
    southFacilityId = `fac-south-${randomUUID().slice(0, 8)}`;
    await seedFacility({
      id: northFacilityId,
      name: 'North Cold Storage Facility',
      code: 'FAC-NORTH',
    });
    await seedFacility({
      id: southFacilityId,
      name: 'South Cold Storage Facility',
      code: 'FAC-SOUTH',
    });

    [
      { token: superAdminToken },
      { token: adminNorthToken },
      { token: adminSouthToken },
      { token: operatorNorthToken },
    ] = await Promise.all([
      seedUser({
        userId: 'usr-md-superadmin',
        username: 'p3.md.superadmin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
      }),
      seedUser({
        userId: 'usr-md-admin-north',
        username: 'p3.md.admin.north',
        role: 'ADMIN',
        facilityIds: [northFacilityId],
      }),
      seedUser({
        userId: 'usr-md-admin-south',
        username: 'p3.md.admin.south',
        role: 'ADMIN',
        facilityIds: [southFacilityId],
      }),
      seedUser({
        userId: 'usr-md-op-north',
        username: 'p3.md.operator.north',
        role: 'OPERATOR',
        facilityIds: [northFacilityId],
      }),
    ]);
  }, 60000);

  afterAll(async () => {
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await FacilityModel.deleteMany({ id: { $in: [northFacilityId, southFacilityId] } });
    await disconnectDatabase();
  }, 60000);

  beforeEach(async () => {
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
  });

  it('registers a customer for one facility only and keys duplicates on case-insensitive name', async () => {
    const created = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Shivaji Rao Patil', facilityId: northFacilityId });

    expect(created.status).toBe(201);
    expect(created.body.customer.name).toBe('Shivaji Rao Patil');
    expect(created.body.customer.isActive).toBe(true);
    expect(created.body.customer.facilityIds).toEqual([northFacilityId]);
    expect(created.body.customer.mobile).toBeUndefined();

    const duplicate = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: '  shivaji rao patil  ', facilityId: northFacilityId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('already exists in this facility');

    // Uniqueness is per facility, so the same name is a distinct customer in the other tenant.
    const southRegistration = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Shivaji Rao Patil', facilityId: southFacilityId });
    expect(southRegistration.status).toBe(201);
    expect(southRegistration.body.customer.facilityIds).toEqual([southFacilityId]);
    expect(southRegistration.body.customer.id).not.toBe(created.body.customer.id);
  });

  it('rejects retired customer columns and out-of-scope facility registration', async () => {
    const staleClient = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Stale Client Customer',
        mobile: '9822334455',
        address: 'Plot 12',
        gstin: '27AAAAA0000A1Z5',
        facilityId: northFacilityId,
      });
    expect(staleClient.status).toBe(400);

    const crossFacility = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ name: 'Cross Facility Customer', facilityId: southFacilityId });
    expect(crossFacility.status).toBe(403);
    expect(crossFacility.body.error).toContain('not authorized to register customer');
  });

  it('creates commodity and enforces case-insensitive whitespace-normalized uniqueness', async () => {
    const created = await request(app)
      .post('/api/commodities')
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ name: 'Potato Jyoti' });

    expect(created.status).toBe(201);
    expect(created.body.commodity.name).toBe('Potato Jyoti');
    expect(created.body.commodity.isActive).toBe(true);

    const duplicate = await request(app)
      .post('/api/commodities')
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ name: '  potato jyoti  ' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain("Commodity with name 'potato jyoti' already exists");
  });

  it('scopes facility reads by access, not by write privilege', async () => {
    const operatorOwnRes = await request(app)
      .get(`/api/facilities/${northFacilityId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(operatorOwnRes.status).toBe(200);
    expect(operatorOwnRes.body.facility.id).toBe(northFacilityId);

    const operatorForeignRes = await request(app)
      .get(`/api/facilities/${southFacilityId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(operatorForeignRes.status).toBe(403);
    expect(operatorForeignRes.body.error).toContain('not authorized to access facility');

    const adminSouthOwnRes = await request(app)
      .get(`/api/facilities/${southFacilityId}`)
      .set('Authorization', `Bearer ${adminSouthToken}`);
    expect(adminSouthOwnRes.status).toBe(200);

    const superAdminRes = await request(app)
      .get(`/api/facilities/${northFacilityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(superAdminRes.status).toBe(200);
  });

  it('restricts facility writes to SUPER_ADMIN via settings:manage', async () => {
    const superAdminUpdate = await request(app)
      .patch(`/api/facilities/${northFacilityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'North Cold Storage Facility (Renamed)' });
    expect(superAdminUpdate.status).toBe(200);
    expect(superAdminUpdate.body.facility.name).toBe('North Cold Storage Facility (Renamed)');

    const adminUpdate = await request(app)
      .patch(`/api/facilities/${northFacilityId}`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ name: 'Admin Rename Attempt' });
    expect(adminUpdate.status).toBe(403);
    expect(adminUpdate.body.error).toContain("Role 'ADMIN' lacks permission 'settings:manage'");

    const operatorUpdate = await request(app)
      .patch(`/api/facilities/${northFacilityId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({ name: 'Operator Rename Attempt' });
    expect(operatorUpdate.status).toBe(403);
    expect(operatorUpdate.body.error).toContain(
      "Role 'OPERATOR' lacks permission 'settings:manage'",
    );
  });

  it('denies facility creation to ADMIN and OPERATOR but allows SUPER_ADMIN', async () => {
    const body = { name: 'Satellite Cold Storage', code: `SAT-${randomUUID().slice(0, 6)}` };

    const adminCreate = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send(body);
    expect(adminCreate.status).toBe(403);
    expect(adminCreate.body.error).toContain("Role 'ADMIN' lacks permission 'settings:manage'");

    const operatorCreate = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send(body);
    expect(operatorCreate.status).toBe(403);
    expect(operatorCreate.body.error).toContain(
      "Role 'OPERATOR' lacks permission 'settings:manage'",
    );

    const superAdminCreate = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(body);
    expect(superAdminCreate.status).toBe(201);
    expect(superAdminCreate.body.facility.code).toBe(body.code.toUpperCase());

    await FacilityModel.deleteMany({ id: superAdminCreate.body.facility.id });
  });
});
