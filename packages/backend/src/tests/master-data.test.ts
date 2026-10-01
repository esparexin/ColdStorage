import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { SessionModel } from '../database/models/session.model.js';
import { UserModel } from '../database/models/user.model.js';
import { hashPassword } from '../utils/crypto.js';

describe('P3 Master Data & Storage Hierarchy Integration', () => {
  const app = createApp();

  const SUPER_ADMIN_USERNAME = 'p3.superadmin';
  const ADMIN_NORTH_USERNAME = 'p3.admin.north';
  const ADMIN_SOUTH_USERNAME = 'p3.admin.south';
  const OPERATOR_NORTH_USERNAME = 'p3.operator.north';
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

  async function loginAndChangePass(username: string): Promise<string> {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password: COMMON_PASSWORD });

    const tempToken = loginRes.body.token;
    if (loginRes.body.mustChangePassword) {
      const newPass = `${COMMON_PASSWORD}Updated!`;
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          currentPassword: COMMON_PASSWORD,
          newPassword: newPass,
        });

      const activeLogin = await request(app)
        .post('/api/auth/login')
        .send({ username, password: newPass });
      return activeLogin.body.token;
    }
    return tempToken;
  }

  beforeEach(async () => {
    // Clean all collections
    await Promise.all([
      FacilityModel.deleteMany({}).exec(),
      ChamberModel.deleteMany({}).exec(),
      RackModel.deleteMany({}).exec(),
      LevelModel.deleteMany({}).exec(),
      PositionModel.deleteMany({}).exec(),
      CustomerModel.deleteMany({}).exec(),
      CommodityModel.deleteMany({}).exec(),
      UserModel.deleteMany({}).exec(),
      SessionModel.deleteMany({}).exec(),
    ]);

    northFacilityId = `fac-north-${randomUUID()}`;
    southFacilityId = `fac-south-${randomUUID()}`;

    // Seed test facilities
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

    // Seed test users
    await UserModel.create([
      {
        id: 'usr-p3-superadmin',
        fullName: 'P3 Super Admin',
        username: SUPER_ADMIN_USERNAME,
        employeeId: 'EMP-P3-01',
        mobile: '9800000001',
        email: 'super@coldstorage.local',
        role: 'SUPER_ADMIN',
        facilityIds: [northFacilityId, southFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-p3-admin-north',
        fullName: 'Admin North',
        username: ADMIN_NORTH_USERNAME,
        employeeId: 'EMP-P3-02',
        mobile: '9800000002',
        email: 'admin.north@coldstorage.local',
        role: 'ADMIN',
        facilityIds: [northFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-p3-admin-south',
        fullName: 'Admin South',
        username: ADMIN_SOUTH_USERNAME,
        employeeId: 'EMP-P3-03',
        mobile: '9800000003',
        email: 'admin.south@coldstorage.local',
        role: 'ADMIN',
        facilityIds: [southFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
      {
        id: 'usr-p3-op-north',
        fullName: 'Operator North',
        username: OPERATOR_NORTH_USERNAME,
        employeeId: 'EMP-P3-04',
        mobile: '9800000004',
        email: 'op.north@coldstorage.local',
        role: 'OPERATOR',
        facilityIds: [northFacilityId],
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: false,
      },
    ]);

    superAdminToken = await loginAndChangePass(SUPER_ADMIN_USERNAME);
    adminNorthToken = await loginAndChangePass(ADMIN_NORTH_USERNAME);
    adminSouthToken = await loginAndChangePass(ADMIN_SOUTH_USERNAME);
    operatorNorthToken = await loginAndChangePass(OPERATOR_NORTH_USERNAME);
  });

  describe('Storage Hierarchy Lifecycle & Uniqueness', () => {
    it('creates full hierarchy: Facility -> Chamber -> Rack -> Level -> Position', async () => {
      // 1. Create Chamber in North facility
      const chamberRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          chamberNumber: 'CH-01',
          name: 'Main Potato Cold Chamber',
        });
      expect(chamberRes.status).toBe(201);
      const chamberId = chamberRes.body.chamber.id;
      expect(chamberRes.body.chamber.chamberNumber).toBe('CH-01');

      // 2. Create Rack in Chamber
      const rackRes = await request(app)
        .post(`/api/chambers/${chamberId}/racks`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'R-01' });
      expect(rackRes.status).toBe(201);
      const rackId = rackRes.body.rack.id;

      // 3. Create Level in Rack
      const levelRes = await request(app)
        .post(`/api/racks/${rackId}/levels`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ levelNumber: 1, code: 'L-01' });
      expect(levelRes.status).toBe(201);
      const levelId = levelRes.body.level.id;

      // 4. Create Position in Level
      const posRes = await request(app)
        .post(`/api/levels/${levelId}/positions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'P-01', capacityBags: 250 });
      expect(posRes.status).toBe(201);
      expect(posRes.body.position.capacityBags).toBe(250);
      expect(posRes.body.position.isActive).toBe(true);

      // Verify listing works through the canonical hierarchy paths
      const listChambersRes = await request(app)
        .get(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(listChambersRes.status).toBe(200);
      expect(listChambersRes.body.total).toBe(1);

      const listRacksRes = await request(app)
        .get(`/api/chambers/${chamberId}/racks`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(listRacksRes.status).toBe(200);
      expect(listRacksRes.body.total).toBe(1);

      const listLevelsRes = await request(app)
        .get(`/api/racks/${rackId}/levels`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(listLevelsRes.status).toBe(200);
      expect(listLevelsRes.body.total).toBe(1);

      const listPositionsRes = await request(app)
        .get(`/api/levels/${levelId}/positions`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(listPositionsRes.status).toBe(200);
      expect(listPositionsRes.body.total).toBe(1);
    });

    it('enforces uniqueness constraints across all hierarchy levels', async () => {
      // Duplicate Facility Code
      const dupFac = await request(app)
        .post('/api/facilities')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'FAC-NORTH', name: 'Duplicate Facility' });
      expect(dupFac.status).toBe(409);

      // Create initial Chamber
      const ch1 = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ chamberNumber: 'CH-ALPHA' });
      expect(ch1.status).toBe(201);

      // Duplicate Chamber Number in same facility
      const dupCh = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ chamberNumber: 'CH-ALPHA' });
      expect(dupCh.status).toBe(409);

      // Same Chamber Number in a DIFFERENT facility is permitted
      const chSouth = await request(app)
        .post(`/api/facilities/${southFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ chamberNumber: 'CH-ALPHA' });
      expect(chSouth.status).toBe(201);

      // Create Rack
      const rk1 = await request(app)
        .post(`/api/chambers/${ch1.body.chamber.id}/racks`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'RACK-01' });
      expect(rk1.status).toBe(201);

      // Duplicate Rack Code in same chamber
      const dupRk = await request(app)
        .post(`/api/chambers/${ch1.body.chamber.id}/racks`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'RACK-01' });
      expect(dupRk.status).toBe(409);

      // Create Level
      const lvl1 = await request(app)
        .post(`/api/racks/${rk1.body.rack.id}/levels`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ levelNumber: 1, code: 'LVL-01' });
      expect(lvl1.status).toBe(201);

      // Duplicate Level Number in same rack
      const dupLvlNum = await request(app)
        .post(`/api/racks/${rk1.body.rack.id}/levels`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ levelNumber: 1, code: 'LVL-02' });
      expect(dupLvlNum.status).toBe(409);

      // Create Position
      const pos1 = await request(app)
        .post(`/api/levels/${lvl1.body.level.id}/positions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'P-01', capacityBags: 100 });
      expect(pos1.status).toBe(201);

      // Duplicate Position Code in same level
      const dupPos = await request(app)
        .post(`/api/levels/${lvl1.body.level.id}/positions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'P-01', capacityBags: 100 });
      expect(dupPos.status).toBe(409);
    });

    it('enforces bottom-up deactivation rules and inactive-parent guards', async () => {
      // Build small hierarchy
      const chRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ chamberNumber: 'CH-DEACT' });
      const chamberId = chRes.body.chamber.id;

      const rkRes = await request(app)
        .post(`/api/chambers/${chamberId}/racks`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ code: 'RK-DEACT' });
      const rackId = rkRes.body.rack.id;

      // 1. Attempt to deactivate chamber while active rack exists -> 409 Conflict
      const deactChFail = await request(app)
        .patch(`/api/chambers/${chamberId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: false });
      expect(deactChFail.status).toBe(409);
      expect(deactChFail.body.error).toContain('Cannot deactivate chamber while it contains active racks');

      // 2. Deactivate the child rack first
      const deactRk = await request(app)
        .patch(`/api/racks/${rackId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: false });
      expect(deactRk.status).toBe(200);
      expect(deactRk.body.rack.isActive).toBe(false);

      // 3. Now deactivating the chamber succeeds
      const deactChSuccess = await request(app)
        .patch(`/api/chambers/${chamberId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: false });
      expect(deactChSuccess.status).toBe(200);
      expect(deactChSuccess.body.chamber.isActive).toBe(false);

      // 4. Attempt to activate rack while parent chamber is inactive -> 409 Conflict
      const actRkFail = await request(app)
        .patch(`/api/racks/${rackId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isActive: true });
      expect(actRkFail.status).toBe(409);
      expect(actRkFail.body.error).toContain('Cannot activate rack because parent chamber is inactive');
    });
  });

  describe('Customer Master Lifecycle', () => {
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

      // Invalid mobile rejected
      const invalidMobileRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Invalid Customer',
          mobile: '12345',
          facilityIds: [northFacilityId],
        });
      expect(invalidMobileRes.status).toBe(400);

      // Registering same mobile with a NEW facility appends facilityId
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
  });

  describe('Commodity Master Lifecycle', () => {
    it('creates commodity and enforces case-insensitive whitespace-normalized uniqueness', async () => {
      const res = await request(app)
        .post('/api/commodities')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Potato Jyoti' });

      expect(res.status).toBe(201);
      expect(res.body.commodity.name).toBe('Potato Jyoti');
      expect(res.body.commodity.isActive).toBe(true);

      // Duplicate with varied casing and whitespace is rejected
      const dupRes = await request(app)
        .post('/api/commodities')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: '  potato jyoti  ' });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toContain("Commodity with name 'potato jyoti' already exists");
    });
  });

  describe('Facility Scoping & Child-ID Scope-Bypass Protection', () => {
    it('enforces RBAC and facility-scoped authorization for Admin vs Operator', async () => {
      // 1. Admin North can create Chamber in North Facility
      const chNorthRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${adminNorthToken}`)
        .send({ chamberNumber: 'CH-NORTH-01' });
      expect(chNorthRes.status).toBe(201);
      const northChamberId = chNorthRes.body.chamber.id;
      expect(northChamberId).toBeDefined();

      // 2. Admin North attempts to create Chamber in South Facility -> 403 Forbidden
      const chSouthDenied = await request(app)
        .post(`/api/facilities/${southFacilityId}/chambers`)
        .set('Authorization', `Bearer ${adminNorthToken}`)
        .send({ chamberNumber: 'CH-SOUTH-DENIED' });
      expect(chSouthDenied.status).toBe(403);
      expect(chSouthDenied.body.error).toContain('not authorized to access facility');

      // 3. Admin South creates Chamber in South Facility
      const chSouthRes = await request(app)
        .post(`/api/facilities/${southFacilityId}/chambers`)
        .set('Authorization', `Bearer ${adminSouthToken}`)
        .send({ chamberNumber: 'CH-SOUTH-01' });
      expect(chSouthRes.status).toBe(201);
      const southChamberId = chSouthRes.body.chamber.id;

      // 4. CHILD-ID SCOPE-BYPASS TEST:
      // Admin North attempts direct PATCH on southChamberId
      // Backend must resolve parent facility to southFacilityId and return 403 Forbidden
      const bypassAttempt = await request(app)
        .patch(`/api/chambers/${southChamberId}`)
        .set('Authorization', `Bearer ${adminNorthToken}`)
        .send({ name: 'Hacked Chamber Name' });
      expect(bypassAttempt.status).toBe(403);
      expect(bypassAttempt.body.error).toContain('not authorized to access facility');

      // Admin South attempts direct PATCH on northChamberId -> 403 Forbidden
      const reciprocalBypass = await request(app)
        .patch(`/api/chambers/${northChamberId}`)
        .set('Authorization', `Bearer ${adminSouthToken}`)
        .send({ name: 'Hacked North Chamber' });
      expect(reciprocalBypass.status).toBe(403);
      expect(reciprocalBypass.body.error).toContain('not authorized to access facility');

      // 5. Operator North can read chambers in North Facility
      const opReadRes = await request(app)
        .get(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${operatorNorthToken}`);
      expect(opReadRes.status).toBe(200);

      // 6. Operator North cannot write/create chambers -> 403 Forbidden (Role lacks storage:manage)
      const opWriteRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/chambers`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({ chamberNumber: 'CH-OP-FAIL' });
      expect(opWriteRes.status).toBe(403);
      expect(opWriteRes.body.error).toContain("Role 'OPERATOR' lacks permission 'storage:manage'");
    });
  });
});
