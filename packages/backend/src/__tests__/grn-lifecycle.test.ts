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

describe('GRN Lifecycle & Sequences Integration', () => {
  let operatorNorthToken: string;

  const northFacilityId = 'fac-north-lifecycle';
  const southFacilityId = 'fac-south-lifecycle';

  let chamberNorthId: string;
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
      code: 'NORTH',
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

    await UserModel.create({
      id: 'user-op-north',
      fullName: 'Operator North',
      employeeId: 'EMP-P4-004',
      mobile: '9800000004',
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
  });

  describe('GRN Creation, Independent FY Sequences & Atomicity', () => {
    it('creates GRN with atomic independent sequences for grnNumber and inwardReceiptNumber', async () => {
      const res = await request(app)
        .post(`/api/facilities/${northFacilityId}/grns`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({
          customerId: customerNorthId,
          commodityId,
          chamberId: chamberNorthId,
          bags: 250,
          bagType: 'S',
          nominalUnitWeight: 50,
          actualWeight: 12580,
          rentType: 'Monthly',
          rentMonths: 4,
          rentAmount: 3750,
          gpNumber: 'GP-2026-X8',
          marks: 'LOT-A-RED',
          vehicleNumber: 'MH12AB1234',
          remarks: 'Stored in good condition',
        });

      expect(res.status).toBe(201);
      const { grn, acknowledgement } = res.body;

      expect(grn.id).toBeDefined();
      expect(grn.facilityId).toBe(northFacilityId);
      expect(grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0001$/);
      expect(grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0001$/);
      expect(grn.status).toBe('OPEN');
      expect(grn.customerName).toBe('Ramesh Patel');
      expect(grn.commodityName).toBe('Potato Jyoti');
      expect(grn.chamberNumber).toBe('CH-NORTH-01');
      expect(grn.bags).toBe(250);
      expect(grn.nominalTotalWeight).toBe(12500);
      expect(grn.actualWeight).toBe(12580);
      expect(grn.authoritativeWeight).toBe(12580);
      expect(grn.rentType).toBe('Monthly');
      expect(grn.rentMonths).toBe(4);
      expect(grn.rentAmount).toBe(3750);

      expect(acknowledgement.grnId).toBe(grn.id);
      expect(acknowledgement.grnNumber).toBe(grn.grnNumber);
      expect(acknowledgement.inwardReceiptNumber).toBe(grn.inwardReceiptNumber);
      expect(acknowledgement.customer.name).toBe('Ramesh Patel');
      expect(acknowledgement.storageLocation.chamberNumber).toBe('CH-NORTH-01');
      expect(acknowledgement.bagAccounting.authoritativeWeight).toBe(12580);

      const res2 = await request(app)
        .post(`/api/facilities/${northFacilityId}/grns`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({
          customerId: customerNorthId,
          commodityId,
          chamberId: chamberNorthId,
          bags: 100,
          bagType: 'B',
          rentType: 'Seasonal',
          rentAmount: 2000,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0002$/);
      expect(res2.body.grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0002$/);
    });

    it('rejects conflicting facilityId in request body', async () => {
      const res = await request(app)
        .post(`/api/facilities/${northFacilityId}/grns`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({
          facilityId: southFacilityId,
          customerId: customerNorthId,
          commodityId,
          chamberId: chamberNorthId,
          bags: 100,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 1000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not match route facilityId');
    });

    it('rolls back transaction on relational failure with zero sequence gaps', async () => {
      const failRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/grns`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({
          customerId: customerNorthId,
          commodityId,
          chamberId: 'cham-nonexistent',
          bags: 100,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 1000,
        });

      expect(failRes.status).toBe(400);

      const validRes = await request(app)
        .post(`/api/facilities/${northFacilityId}/grns`)
        .set('Authorization', `Bearer ${operatorNorthToken}`)
        .send({
          customerId: customerNorthId,
          commodityId,
          chamberId: chamberNorthId,
          bags: 100,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 1000,
        });

      expect(validRes.status).toBe(201);
      expect(validRes.body.grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0001$/);
      expect(validRes.body.grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0001$/);
    });
  });
});
