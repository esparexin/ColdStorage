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

describe('P4 Inward GRN + Acknowledgement Integration', () => {
  let superAdminToken: string;
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;
  let readOnlyNorthToken: string;

  const northFacilityId = 'fac-north-p4';
  const southFacilityId = 'fac-south-p4';

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

    // 1. Seed Facilities
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

    // 2. Seed Chambers
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

    // 3. Seed Commodity
    const comm = await CommodityModel.create({
      id: 'comm-potato-01',
      name: 'Potato Jyoti',
      normalizedName: 'POTATO JYOTI',
      isActive: true,
    });
    commodityId = comm.id;

    // 4. Seed Customer (associated with north facility)
    const cust = await CustomerModel.create({
      id: 'cust-ramesh-01',
      name: 'Ramesh Patel',
      mobile: '9876543210',
      facilityIds: [northFacilityId],
      isActive: true,
    });
    customerNorthId = cust.id;

    // 5. Seed Users & Generate Auth Tokens
    const defaultPasswordHash = await hashPassword('StandardPass123!');

    await UserModel.create({
      id: 'user-superadmin',
      fullName: 'Super Administrator',
      employeeId: 'EMP-P4-001',
      mobile: '9800000001',
      username: 'superadmin',
      email: 'superadmin@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'SUPER_ADMIN',
      facilityIds: [],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

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
      mobile: '9800000004',
      username: 'op.north',
      email: 'op.north@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    await UserModel.create({
      id: 'user-ro-north',
      fullName: 'Read Only North',
      employeeId: 'EMP-P4-005',
      mobile: '9800000005',
      username: 'ro.north',
      email: 'ro.north@coldstorage.local',
      passwordHash: defaultPasswordHash,
      role: 'READ_ONLY',
      facilityIds: [northFacilityId],
      status: 'ACTIVE',
      mustChangePassword: false,
    });

    const superAdminLogin = await authService.login({ username: 'superadmin', password: 'StandardPass123!' });
    superAdminToken = superAdminLogin.accessToken;

    const adminNorthLogin = await authService.login({ username: 'admin.north', password: 'StandardPass123!' });
    adminNorthToken = adminNorthLogin.accessToken;

    const adminSouthLogin = await authService.login({ username: 'admin.south', password: 'StandardPass123!' });
    adminSouthToken = adminSouthLogin.accessToken;

    const opNorthLogin = await authService.login({ username: 'op.north', password: 'StandardPass123!' });
    operatorNorthToken = opNorthLogin.accessToken;

    const roNorthLogin = await authService.login({ username: 'ro.north', password: 'StandardPass123!' });
    readOnlyNorthToken = roNorthLogin.accessToken;
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
      expect(grn.bagType).toBe('S');
      expect(grn.nominalTotalWeight).toBe(12500); // 250 * 50
      expect(grn.actualWeight).toBe(12580);
      expect(grn.authoritativeWeight).toBe(12580); // weighbridge weight takes priority
      expect(grn.rentType).toBe('Monthly');
      expect(grn.rentMonths).toBe(4);
      expect(grn.rentAmount).toBe(3750);
      expect(grn.vehicleNumber).toBe('MH12AB1234');

      // Acknowledgement projection verification
      expect(acknowledgement.grnId).toBe(grn.id);
      expect(acknowledgement.grnNumber).toBe(grn.grnNumber);
      expect(acknowledgement.inwardReceiptNumber).toBe(grn.inwardReceiptNumber);
      expect(acknowledgement.customer.name).toBe('Ramesh Patel');
      expect(acknowledgement.storageLocation.chamberNumber).toBe('CH-NORTH-01');
      expect(acknowledgement.bagAccounting.authoritativeWeight).toBe(12580);

      // Create a second GRN in the same facility: verify sequence increments independently
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
          facilityId: southFacilityId, // Conflicting facilityId
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
      // Attempt creation with non-existent chamber (relational failure)
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

      // Verify next valid GRN still gets sequence 0001 (no gap!)
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

  describe('Relational Validation & Business Constraints', () => {
    it('rejects customer not registered for the target facility', async () => {
      // Customer belongs only to North facility; South admin tries to use it in South
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
          chamberId: chamberSouthId, // South chamber in North route
          bags: 50,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 500,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not belong to facility');
    });

    it('rejects inactive commodity or customer', async () => {
      // Deactivate commodity
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
      // Monthly without rentMonths -> 400
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

      // Seasonal with rentMonths -> 400
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

  describe('Retrieval, Inward Acknowledgement & Query Endpoints', () => {
    let createdGrnId: string;

    beforeEach(async () => {
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

  describe('Facility Scoping, RBAC & Child-ID Scope Protection', () => {
    it('enforces RBAC: Operator can create, Read-Only cannot', async () => {
      // Read-Only cannot create (lacks grn:create)
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
      // 1. Create North GRN
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

      // 2. Register customer for South as well so we can create a South GRN
      await CustomerModel.updateOne({ id: customerNorthId }, { $push: { facilityIds: southFacilityId } });

      // 3. Create South GRN
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

      // 4. CHILD-ID BYPASS TEST 1:
      // Operator North attempts direct fetch of South GRN -> 403 Forbidden
      const bypass1 = await request(app)
        .get(`/api/grns/${southGrnId}`)
        .set('Authorization', `Bearer ${operatorNorthToken}`);
      expect(bypass1.status).toBe(403);
      expect(bypass1.body.error).toContain('not authorized to access facility');

      // 5. CHILD-ID BYPASS TEST 2:
      // Admin South attempts direct fetch of North GRN -> 403 Forbidden
      const bypass2 = await request(app)
        .get(`/api/grns/${northGrnId}`)
        .set('Authorization', `Bearer ${adminSouthToken}`);
      expect(bypass2.status).toBe(403);
      expect(bypass2.body.error).toContain('not authorized to access facility');

      // 6. CHILD-ID BYPASS TEST 3 on Acknowledgement endpoint:
      // Operator North attempts direct fetch of South Acknowledgement -> 403 Forbidden
      const bypass3 = await request(app)
        .get(`/api/grns/${southGrnId}/acknowledgement`)
        .set('Authorization', `Bearer ${operatorNorthToken}`);
      expect(bypass3.status).toBe(403);
      expect(bypass3.body.error).toContain('not authorized to access facility');

      // 7. Super Admin has global scope and can access both
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
});
