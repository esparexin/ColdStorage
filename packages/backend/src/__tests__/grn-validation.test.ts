import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { UserModel } from '../database/models/user.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('GRN Relational Validation & Business Constraints', () => {
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;

  const northFacilityId = 'fac-north-rel-val';
  const southFacilityId = 'fac-south-rel-val';

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

    await FacilityModel.create({
      id: northFacilityId,
      code: 'NORTHV',
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
      id: 'cham-north-val',
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
      id: 'comm-potato-val',
      name: 'Potato Jyoti',
      normalizedName: 'POTATO JYOTI VAL',
      isActive: true,
    });
    commodityId = comm.id;

    const cust = await CustomerModel.create({
      id: 'cust-ramesh-val',
      name: 'Ramesh Patel',
      mobile: '9876500002',
      facilityIds: [northFacilityId],
      isActive: true,
    });
    customerNorthId = cust.id;

    const defaultPasswordHash = await hashPassword('StandardPass123!');

    await UserModel.create({
      id: 'user-admin-north',
      fullName: 'Admin North',
      employeeId: 'EMP-P4-002',
      mobile: '9800000002',
      username: 'admin.north',
      email: 'admin.north@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      facilityIds: [northFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    await UserModel.create({
      id: 'user-admin-south',
      fullName: 'Admin South',
      employeeId: 'EMP-P4-003',
      mobile: '9800000003',
      username: 'admin.south',
      email: 'admin.south@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      facilityIds: [southFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    await UserModel.create({
      id: 'user-op-north',
      fullName: 'Operator North',
      employeeId: 'EMP-P4-004',
      mobile: '9800000002',
      username: 'op.north',
      email: 'op.north@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    const adminNorthLogin = await authService.login({ username: 'admin.north', password: 'StandardPass123!' });
    adminNorthToken = adminNorthLogin.accessToken;

    const adminSouthLogin = await authService.login({ username: 'admin.south', password: 'StandardPass123!' });
    adminSouthToken = adminSouthLogin.accessToken;

    const opNorthLogin = await authService.login({ username: 'op.north', password: 'StandardPass123!' });
    operatorNorthToken = opNorthLogin.accessToken;
  });

  it('rejects customer not registered for the target facility', async () => {
    const res = await request(app)
      .post(`/api/facilities/${southFacilityId}/grns`)
      .set('Authorization', `Bearer ${adminSouthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberSouthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not registered for facility');
  });

  it('rejects chamber belonging to a different facility', async () => {
    const res = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
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

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not belong to facility');
  });

  it('rejects inactive commodity or customer', async () => {
    await CommodityModel.updateOne({ id: commodityId }, { isActive: false });

    const res = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is inactive');
  });

  it('enforces conditional rent terms: Monthly requires rentMonths, Seasonal requires null', async () => {
    const res1 = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Monthly',
        rentAmount: 500,
      });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentMonths: 3,
        rentAmount: 500,
      });
    expect(res2.status).toBe(400);
  });
});
