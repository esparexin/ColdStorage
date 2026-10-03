import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { UserModel } from '../database/models/user.model.js';
import { clearRateLimiterStore } from '../middleware/rate-limiter.middleware.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('Storage Rack Space Protection Guards', () => {
  let adminToken: string;
  const facilityId = 'fac-guard-1';
  const chamberId = 'ch-guard-1';
  const rackId = 'rk-guard-1';
  const levelId = 'lvl-guard-1';
  const posId = 'pos-guard-1';

  beforeAll(async () => {
    clearRateLimiterStore();
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    clearRateLimiterStore();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({ id: facilityId });
    await ChamberModel.deleteMany({ facilityId });
    await RackModel.deleteMany({ facilityId });
    await LevelModel.deleteMany({ facilityId });
    await PositionModel.deleteMany({ facilityId });
    await InventoryTransactionModel.deleteMany({ facilityId });
    await UserModel.deleteMany({ username: 'guard.admin' });

    await FacilityModel.create({
      id: facilityId,
      code: 'F-GUARD',
      name: 'Guard Facility',
      isActive: true,
    });
    await ChamberModel.create({
      id: chamberId,
      facilityId,
      chamberNumber: '1',
      isActive: true,
    });
    await RackModel.create({
      id: rackId,
      chamberId,
      facilityId,
      code: 'A',
      isActive: true,
    });
    await LevelModel.create({
      id: levelId,
      rackId,
      chamberId,
      facilityId,
      levelNumber: 1,
      code: 'A01',
      isActive: true,
    });
    await PositionModel.create({
      id: posId,
      levelId,
      rackId,
      chamberId,
      facilityId,
      code: 'A01-01',
      capacityBags: 100,
      isActive: true,
    });

    await UserModel.create({
      id: 'usr-guard-admin',
      username: 'guard.admin',
      fullName: 'Guard Admin',
      email: 'guard.admin@example.com',
      mobile: '9876543210',
      employeeId: 'EMP-GUARD-01',
      passwordHash: await hashPassword('AdminPass123!'),
      role: 'ADMIN',
      facilityIds: [facilityId],
      mustChangePassword: false,
      isActive: true,
    });
    const login = await authService.login({
      username: 'guard.admin',
      password: 'AdminPass123!',
    });
    adminToken = login.accessToken;
  });

  it('allows deactivating an empty rack space', async () => {
    const res = await request(app)
      .patch(`/api/positions/${posId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.position.isActive).toBe(false);
  });

  it('rejects deactivating a rack space that contains active inventory with 409', async () => {
    await InventoryTransactionModel.create({
      id: 'txn-guard-1',
      facilityId,
      chamberId,
      rackId,
      levelId,
      positionId: posId,
      positionCode: 'A01-01',
      grnId: 'grn-guard-1',
      grnNumber: 'GRN-G-001',
      customerId: 'cust-g-1',
      commodityId: 'cmd-g-1',
      bagType: 'B',
      quantity: 50,
      transactionType: 'INWARD_PUTAWAY',
      referenceType: 'PUT_AWAY',
      referenceId: 'ref-1',
      createdBy: 'usr-guard-admin',
      createdAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/positions/${posId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Cannot deactivate rack space while it contains active inventory');
  });

  it('rejects reducing capacity below currently held inventory with 409', async () => {
    await InventoryTransactionModel.create({
      id: 'txn-guard-2',
      facilityId,
      chamberId,
      rackId,
      levelId,
      positionId: posId,
      positionCode: 'A01-01',
      grnId: 'grn-guard-1',
      grnNumber: 'GRN-G-001',
      customerId: 'cust-g-1',
      commodityId: 'cmd-g-1',
      bagType: 'B',
      quantity: 60,
      transactionType: 'INWARD_PUTAWAY',
      referenceType: 'PUT_AWAY',
      referenceId: 'ref-2',
      createdBy: 'usr-guard-admin',
      createdAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/positions/${posId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacityBags: 40 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Cannot reduce capacity to 40 bags: currently holds 60 bags');
  });
});
