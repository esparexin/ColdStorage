import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { UserModel } from '../database/models/user.model.js';
import { hashPassword } from '../utils/crypto.js';

describe('Customer Duplicate Prevention Integration', () => {
  const app = createApp();
  const TEST_PASSWORD = 'TestPassword123!';
  let adminToken: string;
  let facilityA: string;
  let facilityB: string;

  beforeAll(async () => {
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');

    facilityA = `fac-dup-a-${randomUUID().slice(0, 8)}`;
    facilityB = `fac-dup-b-${randomUUID().slice(0, 8)}`;
    await FacilityModel.create([
      { id: facilityA, name: 'Facility Alpha', code: `FA-${randomUUID().slice(0, 4)}`, isActive: true },
      { id: facilityB, name: 'Facility Beta', code: `FB-${randomUUID().slice(0, 4)}`, isActive: true },
    ]);

    const adminUser = `admin_${randomUUID().slice(0, 8)}`;
    await UserModel.create({
      id: `usr-${randomUUID()}`,
      fullName: 'Super Admin Test',
      username: adminUser,
      employeeId: `EMP-${randomUUID().slice(0, 6)}`,
      mobile: '9800000099',
      email: `${adminUser}@coldstorage.local`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: 'SUPER_ADMIN',
      facilityIds: [facilityA, facilityB],
      status: 'ACTIVE',
      mustChangePassword: false,
      isActive: true,
    });

    const loginRes = await request(app).post('/api/auth/login').send({ username: adminUser, password: TEST_PASSWORD });
    adminToken = loginRes.body.token as string;
  });

  afterAll(async () => {
    await CustomerModel.deleteMany({ facilityIds: { $in: [facilityA, facilityB] } });
    await FacilityModel.deleteMany({ id: { $in: [facilityA, facilityB] } });
    await disconnectDatabase();
  });

  it('enforces duplicate customer name prevention in same facility', async () => {
    const res1 = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Ramesh Agro Foods',
        mobile: '9811223344',
        facilityIds: [facilityA],
      });
    expect(res1.status).toBe(201);
    expect(res1.body.customer.name).toBe('Ramesh Agro Foods');

    // Duplicate name with varied casing and whitespace in same facility
    const dupRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '  ramesh agro foods  ',
        mobile: '9855667788',
        facilityIds: [facilityA],
      });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toContain("Customer with name 'ramesh agro foods' already exists in this facility");
  });

  it('enforces duplicate mobile rejection when registering for already associated facility', async () => {
    const dupMobileRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Unique Entity Name',
        mobile: '9811223344',
        facilityIds: [facilityA],
      });
    expect(dupMobileRes.status).toBe(409);
    expect(dupMobileRes.body.error).toContain('already registered for all requested facilities');
  });

  it('rejects updating an existing customer to a name that collides in the same facility', async () => {
    const res2 = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Suresh Cold Chain',
        mobile: '9899001122',
        facilityIds: [facilityA],
      });
    expect(res2.status).toBe(201);
    const customerId2 = res2.body.customer.id as string;

    const updateDupRes = await request(app)
      .patch(`/api/customers/${customerId2}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  RAMESH AGRO FOODS  ' });
    expect(updateDupRes.status).toBe(409);
    expect(updateDupRes.body.error).toContain("Customer with name 'RAMESH AGRO FOODS' already exists in this facility");
  });
});
