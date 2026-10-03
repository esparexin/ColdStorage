import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { SessionModel } from '../database/models/session.model.js';
import { UserModel } from '../database/models/user.model.js';
import { hashPassword } from '../utils/crypto.js';

describe('Master Data & Facility Scoping RBAC', () => {
  const app = createApp();

  const SUPER_ADMIN_USERNAME = 'p3.md.superadmin';
  const ADMIN_NORTH_USERNAME = 'p3.md.admin.north';
  const ADMIN_SOUTH_USERNAME = 'p3.md.admin.south';
  const OPERATOR_NORTH_USERNAME = 'p3.md.operator.north';
  const COMMON_PASSWORD = 'TestMasterDataPass123!';

  let superAdminToken: string;
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;

  let northFacilityId: string;
  let southFacilityId: string;

  beforeAll(async () => {
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  async function loginUser(username: string): Promise<string> {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password: COMMON_PASSWORD });
    return loginRes.body.token;
  }

  beforeEach(async () => {
    await Promise.all([
      FacilityModel.deleteMany({}).exec(),
      ChamberModel.deleteMany({}).exec(),
      CustomerModel.deleteMany({}).exec(),
      CommodityModel.deleteMany({}).exec(),
      UserModel.deleteMany({}).exec(),
      SessionModel.deleteMany({}).exec(),
    ]);

    northFacilityId = `fac-north-${randomUUID()}`;
    southFacilityId = `fac-south-${randomUUID()}`;

    await FacilityModel.create([
      {
        id: northFacilityId,
        code: 'FAC-NORTH',
        name: 'North Cold Storage Facility',
        address: 'Sector 5, Industrial Area, Nashik',
        isActive: true,
      },
      {
        id: southFacilityId,
        code: 'FAC-SOUTH',
        name: 'South Cold Storage Facility',
        address: 'GIDC Estate, Pune',
        isActive: true,
      },
    ]);

    const passwordHash = await hashPassword(COMMON_PASSWORD);

    await UserModel.create([
      {
        id: 'usr-md-superadmin',
        fullName: 'P3 Super Admin',
        username: SUPER_ADMIN_USERNAME,
        employeeId: 'EMP-MD-01',
        mobile: '9800000001',
        email: 'super@coldstorage.local',
        role: 'SUPER_ADMIN',
        facilityIds: [northFacilityId, southFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-md-admin-north',
        fullName: 'Admin North',
        username: ADMIN_NORTH_USERNAME,
        employeeId: 'EMP-MD-02',
        mobile: '9800000002',
        email: 'admin.north@coldstorage.local',
        role: 'ADMIN',
        facilityIds: [northFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-md-admin-south',
        fullName: 'Admin South',
        username: ADMIN_SOUTH_USERNAME,
        employeeId: 'EMP-MD-03',
        mobile: '9800000003',
        email: 'admin.south@coldstorage.local',
        role: 'ADMIN',
        facilityIds: [southFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-md-op-north',
        fullName: 'Operator North',
        username: OPERATOR_NORTH_USERNAME,
        employeeId: 'EMP-MD-04',
        mobile: '9800000004',
        email: 'op.north@coldstorage.local',
        role: 'OPERATOR',
        facilityIds: [northFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
    ]);

    superAdminToken = await loginUser(SUPER_ADMIN_USERNAME);
    adminNorthToken = await loginUser(ADMIN_NORTH_USERNAME);
    adminSouthToken = await loginUser(ADMIN_SOUTH_USERNAME);
    operatorNorthToken = await loginUser(OPERATOR_NORTH_USERNAME);
  });

  it('creates customer with 10-digit India mobile and associates facilities', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Shivaji Rao Patil',
        mobile: '9822334455',
        address: 'Plot 12, APMC Market Yard, Nashik',
        gstin: '27AAAAA0000A1Z5',
        facilityIds: [northFacilityId],
      });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe('Shivaji Rao Patil');
    expect(res.body.customer.mobile).toBe('9822334455');
    expect(res.body.customer.isActive).toBe(true);

    const invalidMobileRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Invalid Customer',
        mobile: '12345',
        facilityIds: [northFacilityId],
      });
    expect(invalidMobileRes.status).toBe(400);

    const appendFacilityRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Shivaji Rao Patil',
        mobile: '9822334455',
        facilityIds: [southFacilityId],
      });
    expect(appendFacilityRes.status).toBe(201);
    expect(appendFacilityRes.body.customer.facilityIds).toContain(northFacilityId);
    expect(appendFacilityRes.body.customer.facilityIds).toContain(southFacilityId);
  });

  it('creates commodity and enforces case-insensitive whitespace-normalized uniqueness', async () => {
    const res = await request(app)
      .post('/api/commodities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Potato Jyoti' });

    expect(res.status).toBe(201);
    expect(res.body.commodity.name).toBe('Potato Jyoti');
    expect(res.body.commodity.isActive).toBe(true);

    const dupRes = await request(app)
      .post('/api/commodities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: '  potato jyoti  ' });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toContain("Commodity with name 'potato jyoti' already exists");
  });

  it('enforces RBAC and facility-scoped authorization for Admin vs Operator', async () => {
    const chNorthRes = await request(app)
      .post(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ chamberNumber: 'CH-NORTH-01' });
    expect(chNorthRes.status).toBe(201);
    const northChamberId = chNorthRes.body.chamber.id;
    expect(northChamberId).toBeDefined();

    const chSouthDenied = await request(app)
      .post(`/api/facilities/${southFacilityId}/chambers`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ chamberNumber: 'CH-SOUTH-DENIED' });
    expect(chSouthDenied.status).toBe(403);
    expect(chSouthDenied.body.error).toContain('not authorized to access facility');

    const chSouthRes = await request(app)
      .post(`/api/facilities/${southFacilityId}/chambers`)
      .set('Authorization', `Bearer ${adminSouthToken}`)
      .send({ chamberNumber: 'CH-SOUTH-01' });
    expect(chSouthRes.status).toBe(201);
    const southChamberId = chSouthRes.body.chamber.id;

    const bypassAttempt = await request(app)
      .patch(`/api/chambers/${southChamberId}`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ name: 'Hacked Chamber Name' });
    expect(bypassAttempt.status).toBe(403);
    expect(bypassAttempt.body.error).toContain('not authorized to access facility');

    const reciprocalBypass = await request(app)
      .patch(`/api/chambers/${northChamberId}`)
      .set('Authorization', `Bearer ${adminSouthToken}`)
      .send({ name: 'Hacked North Chamber' });
    expect(reciprocalBypass.status).toBe(403);
    expect(reciprocalBypass.body.error).toContain('not authorized to access facility');

    const opReadRes = await request(app)
      .get(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(opReadRes.status).toBe(200);

    const opWriteRes = await request(app)
      .post(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({ chamberNumber: 'CH-OP-FAIL' });
    expect(opWriteRes.status).toBe(403);
    expect(opWriteRes.body.error).toContain("Role 'OPERATOR' lacks permission 'storage:manage'");
  });
});
