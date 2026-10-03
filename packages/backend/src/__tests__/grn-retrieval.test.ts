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
import { clearRateLimiterStore } from '../middleware/rate-limiter.middleware.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('GRN Retrieval & Acknowledgement Projections', () => {
  let operatorNorthToken: string;

  const northFacilityId = 'fac-north-retrieval';

  let chamberNorthId: string;
  let customerNorthId: string;
  let commodityId: string;
  let createdGrnId: string;

  const customerMobile = '9876500024';

  beforeAll(async () => {
    clearRateLimiterStore();
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    clearRateLimiterStore();
    await CustomerModel.deleteMany({ $or: [{ id: 'cust-ramesh-ret' }, { mobile: customerMobile }] });
    await UserModel.deleteMany({ $or: [{ id: 'user-op-north' }, { username: 'op.north' }] });
    await FacilityModel.deleteMany({ id: northFacilityId });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await UserModel.deleteMany({ $or: [{ id: 'user-op-north' }, { username: 'op.north' }] });
    await FacilityModel.deleteMany({ id: northFacilityId });
    await ChamberModel.deleteMany({ facilityId: northFacilityId });
    await CustomerModel.deleteMany({ $or: [{ id: 'cust-ramesh-ret' }, { mobile: customerMobile }] });
    await CommodityModel.deleteMany({ id: 'comm-potato-ret' });
    await GrnModel.deleteMany({ facilityId: northFacilityId });
    await CounterModel.deleteMany({ facilityId: northFacilityId });

    await FacilityModel.create({
      id: northFacilityId,
      code: 'NORTHR',
      name: 'North Cold Facility',
      isActive: true,
    });

    const chNorth = await ChamberModel.create({
      id: 'cham-north-ret',
      facilityId: northFacilityId,
      chamberNumber: 'CH-NORTH-01',
      isActive: true,
    });
    chamberNorthId = chNorth.id;

    const comm = await CommodityModel.create({
      id: 'comm-potato-ret',
      name: 'Potato Jyoti',
      normalizedName: 'POTATO JYOTI RET',
      isActive: true,
    });
    commodityId = comm.id;

    const cust = await CustomerModel.create({
      id: 'cust-ramesh-ret',
      name: 'Ramesh Patel',
      mobile: customerMobile,
      facilityIds: [northFacilityId],
      isActive: true,
    });
    customerNorthId = cust.id;

    const defaultPasswordHash = await hashPassword('StandardPass123!');

    await UserModel.create({
      id: 'user-op-north',
      fullName: 'Operator North',
      employeeId: 'EMP-P4-004',
      mobile: '9800000024',
      username: 'op.north',
      email: 'op.north@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    const opNorthLogin = await authService.login({ username: 'op.north', password: 'StandardPass123!' });
    operatorNorthToken = opNorthLogin.accessToken;

    const res = await request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamberId: chamberNorthId,
        bags: 120,
        bagType: 'S+B',
        rentType: 'Seasonal',
        rentAmount: 1800,
      });
    createdGrnId = res.body.grn.id;
  });

  it('retrieves single GRN by ID', async () => {
    const res = await request(app)
      .get(`/api/grns/${createdGrnId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.grn.id).toBe(createdGrnId);
    expect(res.body.grn.bags).toBe(120);
  });

  it('retrieves Inward Acknowledgement projection by GRN ID', async () => {
    const res = await request(app)
      .get(`/api/grns/${createdGrnId}/acknowledgement`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.acknowledgement.grnId).toBe(createdGrnId);
    expect(res.body.acknowledgement.bagAccounting.bags).toBe(120);
    expect(res.body.acknowledgement.bagAccounting.bagType).toBe('S+B');
    expect(res.body.acknowledgement.rentTerms.rentType).toBe('Seasonal');
  });

  it('lists GRNs for facility with filtering and pagination', async () => {
    const res = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns?page=1&limit=10`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });
});
