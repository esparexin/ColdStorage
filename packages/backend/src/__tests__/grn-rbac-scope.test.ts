import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { UserModel } from '../database/models/user.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('GRN Facility Scoping, RBAC & Child-ID Protection', () => {
  let superAdminToken: string;
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;
  let readOnlyNorthToken: string;

  const northFacilityId = 'fac-north-scope';
  const southFacilityId = 'fac-south-scope';

  let chamberNorthId: string;
  let chamberSouthId: string;
  let customerNorthId: string;
  let commodityId: string;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});

    await FacilityModel.create({
      id: northFacilityId,
      code: 'NORTHS',
      name: 'North Cold Facility',
      isActive: true,
    });
    await FacilityModel.create({
      id: southFacilityId,
      code: 'SOUTH',
      name: 'South Cold Facility',
      isActive: true,
    });

    const chNorth = await ChamberModel.create({
      id: 'cham-north-01',
      facilityId: northFacilityId,
      chamberNumber: 'CH-NORTH-01',
      isActive: true,
    });
    chamberNorthId = chNorth.id;

    const chSouth = await ChamberModel.create({
      id: 'cham-south-01',
      facilityId: southFacilityId,
      chamberNumber: 'CH-SOUTH-01',
      isActive: true,
    });
    chamberSouthId = chSouth.id;

    const comm = await CommodityModel.create({
      id: 'comm-potato-01',
      name: 'Potato Jyoti',
      normalizedName: 'POTATO JYOTI',
      isActive: true,
    });
    commodityId = comm.id;

    const cust = await CustomerModel.create({
      id: 'cust-ramesh-01',
      name: 'Ramesh Patel',
      mobile: '9876543210',
      facilityIds: [northFacilityId],
      isActive: true,
    });
    customerNorthId = cust.id;

    const defaultPasswordHash = await hashPassword('StandardPass123!');
    const users = [
      { id: 'u-sa', username: 'superadmin', role: 'SUPER_ADMIN', facilityIds: [] },
      { id: 'u-an', username: 'admin.north', role: 'ADMIN', facilityIds: [northFacilityId] },
      { id: 'u-as', username: 'admin.south', role: 'ADMIN', facilityIds: [southFacilityId] },
      { id: 'u-on', username: 'op.north', role: 'OPERATOR', facilityIds: [northFacilityId] },
      { id: 'u-ro', username: 'ro.north', role: 'READ_ONLY', facilityIds: [northFacilityId] },
    ];
    await UserModel.create(
      users.map((u, i) => ({
        id: u.id,
        fullName: u.username,
        employeeId: `EMP-${i + 1}`,
        mobile: `980000000${i + 1}`,
        username: u.username,
        email: `${u.username}@coldstorage.local`,
        passwordHash: defaultPasswordHash,
        role: u.role,
        facilityIds: u.facilityIds,
        status: 'ACTIVE',
        mustChangePassword: false,
      })),
    );

    const logins = await Promise.all(
      users.map((u) => authService.login({ username: u.username, password: 'StandardPass123!' })),
    );
    [superAdminToken, adminNorthToken, adminSouthToken, operatorNorthToken, readOnlyNorthToken] =
      logins.map((l) => l.accessToken);
  });

  it('enforces RBAC: Operator can create, Read-Only cannot', async () => {
    const roRes = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${readOnlyNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
      });

    expect(roRes.status).toBe(403);
    expect(roRes.body.error).toContain("Role 'READ_ONLY' lacks permission 'grn:create'");
  });

  it('enforces authenticated facility-scoped authorization: Admin North cannot create in South', async () => {
    const res = await request(app)
      .post(`/api/facilities/${southFacilityId}/grns`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberSouthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces bidirectional child-ID scope-bypass protection on GET /api/grns/:grnId', async () => {
    const northRes = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 75,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 800,
      });
    const northGrnId = northRes.body.grn.id;

    await CustomerModel.updateOne({ id: customerNorthId }, { $push: { facilityIds: southFacilityId } });

    const southRes = await request(app)
      .post(`/api/facilities/${southFacilityId}/grns`)
      .set('Authorization', `Bearer ${adminSouthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberSouthId,
        bags: 90,
        bagType: 'B',
        rentType: 'Seasonal',
        rentAmount: 900,
      });
    const southGrnId = southRes.body.grn.id;

    const bypass1 = await request(app)
      .get(`/api/grns/${southGrnId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(bypass1.status).toBe(403);
    expect(bypass1.body.error).toContain('not authorized to access facility');

    const bypass2 = await request(app)
      .get(`/api/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${adminSouthToken}`);
    expect(bypass2.status).toBe(403);
    expect(bypass2.body.error).toContain('not authorized to access facility');

    const bypass3 = await request(app)
      .get(`/api/grns/${southGrnId}/acknowledgement`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(bypass3.status).toBe(403);
    expect(bypass3.body.error).toContain('not authorized to access facility');

    const saNorth = await request(app)
      .get(`/api/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(saNorth.status).toBe(200);

    const saSouth = await request(app)
      .get(`/api/grns/${southGrnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(saSouth.status).toBe(200);
  });
});
