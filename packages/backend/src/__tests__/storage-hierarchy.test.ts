import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { SessionModel } from '../database/models/session.model.js';
import { UserModel } from '../database/models/user.model.js';
import { hashPassword } from '../utils/crypto.js';

describe('Storage Hierarchy Lifecycle & Uniqueness', () => {
  const app = createApp();

  const SUPER_ADMIN_USERNAME = 'p3.hierarchy.superadmin';
  const COMMON_PASSWORD = 'TestMasterDataPass123!';

  let superAdminToken: string;
  let northFacilityId: string;
  let southFacilityId: string;

  beforeAll(async () => {
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      FacilityModel.deleteMany({}).exec(),
      ChamberModel.deleteMany({}).exec(),
      RackModel.deleteMany({}).exec(),
      LevelModel.deleteMany({}).exec(),
      PositionModel.deleteMany({}).exec(),
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

    await UserModel.create({
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
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: SUPER_ADMIN_USERNAME, password: COMMON_PASSWORD });
    superAdminToken = loginRes.body.token;
  });

  it('creates full hierarchy: Facility -> Chamber -> Rack -> Level -> Position', async () => {
    const chamberRes = await request(app)
      .post(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ chamberNumber: 'CH-01', name: 'Main Potato Cold Chamber' });
    expect(chamberRes.status).toBe(201);
    const chamberId = chamberRes.body.chamber.id;
    expect(chamberRes.body.chamber.chamberNumber).toBe('CH-01');

    const rackRes = await request(app)
      .post(`/api/chambers/${chamberId}/racks`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'R-01' });
    expect(rackRes.status).toBe(201);
    const rackId = rackRes.body.rack.id;

    const levelRes = await request(app)
      .post(`/api/racks/${rackId}/levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ levelNumber: 1, code: 'L-01' });
    expect(levelRes.status).toBe(201);
    const levelId = levelRes.body.level.id;

    const posRes = await request(app)
      .post(`/api/levels/${levelId}/positions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'P-01', capacityBags: 250 });
    expect(posRes.status).toBe(201);
    expect(posRes.body.position.capacityBags).toBe(250);
    expect(posRes.body.position.isActive).toBe(true);

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
    const dupFac = await request(app)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'FAC-NORTH', name: 'Duplicate Facility' });
    expect(dupFac.status).toBe(409);

    const ch1 = await request(app)
      .post(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ chamberNumber: 'CH-ALPHA' });
    expect(ch1.status).toBe(201);

    const dupCh = await request(app)
      .post(`/api/facilities/${northFacilityId}/chambers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ chamberNumber: 'CH-ALPHA' });
    expect(dupCh.status).toBe(409);

    const chSouth = await request(app)
      .post(`/api/facilities/${southFacilityId}/chambers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ chamberNumber: 'CH-ALPHA' });
    expect(chSouth.status).toBe(201);

    const rk1 = await request(app)
      .post(`/api/chambers/${ch1.body.chamber.id}/racks`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'RACK-01' });
    expect(rk1.status).toBe(201);

    const dupRk = await request(app)
      .post(`/api/chambers/${ch1.body.chamber.id}/racks`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'RACK-01' });
    expect(dupRk.status).toBe(409);

    const lvl1 = await request(app)
      .post(`/api/racks/${rk1.body.rack.id}/levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ levelNumber: 1, code: 'LVL-01' });
    expect(lvl1.status).toBe(201);

    const dupLvlNum = await request(app)
      .post(`/api/racks/${rk1.body.rack.id}/levels`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ levelNumber: 1, code: 'LVL-02' });
    expect(dupLvlNum.status).toBe(409);

    const pos1 = await request(app)
      .post(`/api/levels/${lvl1.body.level.id}/positions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'P-01', capacityBags: 100 });
    expect(pos1.status).toBe(201);

    const dupPos = await request(app)
      .post(`/api/levels/${lvl1.body.level.id}/positions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: 'P-01', capacityBags: 100 });
    expect(dupPos.status).toBe(409);
  });

  it('enforces bottom-up deactivation rules and inactive-parent guards', async () => {
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

    const deactChFail = await request(app)
      .patch(`/api/chambers/${chamberId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(deactChFail.status).toBe(409);
    expect(deactChFail.body.error).toContain('Cannot deactivate chamber while it contains active racks');

    const deactRk = await request(app)
      .patch(`/api/racks/${rackId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(deactRk.status).toBe(200);
    expect(deactRk.body.rack.isActive).toBe(false);

    const deactChSuccess = await request(app)
      .patch(`/api/chambers/${chamberId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(deactChSuccess.status).toBe(200);
    expect(deactChSuccess.body.chamber.isActive).toBe(false);

    const actRkFail = await request(app)
      .patch(`/api/racks/${rackId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: true });
    expect(actRkFail.status).toBe(409);
    expect(actRkFail.body.error).toContain('Cannot activate rack because parent chamber is inactive');
  });
});
