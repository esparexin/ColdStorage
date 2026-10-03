import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { UserModel } from '../database/models/user.model.js';
import { clearRateLimiterStore } from '../middleware/rate-limiter.middleware.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedFacility } from './helpers/master-data-fixtures.js';

/**
 * Customer duplicate prevention.
 *
 * Name is the sole customer identity, so duplication is a case-insensitive, whitespace-trimmed
 * name match scoped to the target facility. There is no mobile-keyed identity and no
 * re-registration merge to exercise any more.
 */
describe('Customer Duplicate Prevention Integration', () => {
  const app = createApp();
  const FACILITY_A = 'fac-dup-a';
  const FACILITY_B = 'fac-dup-b';
  const seed = createAuthSeeder(config.jwtSecret);
  let adminToken: string;

  const createCustomer = (body: Record<string, unknown>) =>
    request(app).post('/api/customers').set('Authorization', `Bearer ${adminToken}`).send(body);

  /** Re-seeded per test so the suite is order-independent and re-runnable against a dirty database. */
  const seedFacilities = async () => {
    await seedFacility({ id: FACILITY_A, name: 'Facility Alpha', code: 'FADUPA' });
    await seedFacility({ id: FACILITY_B, name: 'Facility Beta', code: 'FADUPB' });
  };

  beforeAll(async () => {
    clearRateLimiterStore();
    await connectToDatabase();

    ({ token: adminToken } = await seed({
      userId: 'usr-dup-admin',
      username: 'dup_admin',
      role: 'SUPER_ADMIN',
      facilityIds: [FACILITY_A, FACILITY_B],
    }));
  }, 30000);

  beforeEach(seedFacilities);

  afterAll(async () => {
    await CustomerModel.deleteMany({ facilityIds: { $in: [FACILITY_A, FACILITY_B] } });
    await FacilityModel.deleteMany({ id: { $in: [FACILITY_A, FACILITY_B] } });
    await UserModel.deleteMany({ id: 'usr-dup-admin' });
    clearRateLimiterStore();
    await disconnectDatabase();
  }, 30000);

  it('registers a name-only customer for a facility and returns no retired identity fields', async () => {
    const res = await createCustomer({ name: 'Ramesh Agro Foods', facilityId: FACILITY_A });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe('Ramesh Agro Foods');
    expect(res.body.customer.facilityIds).toEqual([FACILITY_A]);
    expect(res.body.customer.isActive).toBe(true);
    expect(res.body.customer).not.toHaveProperty('mobile');
    expect(res.body.customer).not.toHaveProperty('address');
    expect(res.body.customer).not.toHaveProperty('gstin');
  });

  it('enforces duplicate customer name prevention in same facility, ignoring case and padding', async () => {
    await createCustomer({ name: 'Same Facility Traders', facilityId: FACILITY_A });

    const dupRes = await createCustomer({
      name: '  same FACILITY traders  ',
      facilityId: FACILITY_A,
    });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toContain(
      "Customer with name 'same FACILITY traders' already exists in this facility",
    );
  });

  it('permits the same customer name to be registered independently in another facility', async () => {
    const first = await createCustomer({ name: 'Cross Facility Traders', facilityId: FACILITY_A });
    expect(first.status).toBe(201);

    const otherFacility = await createCustomer({
      name: 'CROSS FACILITY TRADERS',
      facilityId: FACILITY_B,
    });

    expect(otherFacility.status).toBe(201);
    expect(otherFacility.body.customer.name).toBe('CROSS FACILITY TRADERS');
    expect(otherFacility.body.customer.facilityIds).toEqual([FACILITY_B]);
    expect(otherFacility.body.customer.id).not.toBe(first.body.customer.id);
  });

  it('rejects a retired identity field (mobile) via the strict create schema', async () => {
    const res = await createCustomer({
      name: 'Strict Schema Traders',
      facilityId: FACILITY_A,
      mobile: '9811223344',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  it('rejects updating an existing customer to a name that collides in the same facility', async () => {
    const created = await createCustomer({ name: 'Suresh Cold Chain', facilityId: FACILITY_A });
    expect(created.status).toBe(201);

    const updateDupRes = await request(app)
      .patch(`/api/customers/${created.body.customer.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  RAMESH AGRO FOODS  ' });

    expect(updateDupRes.status).toBe(409);
    expect(updateDupRes.body.error).toContain(
      "Customer with name 'RAMESH AGRO FOODS' already exists in this facility",
    );
  });
});
