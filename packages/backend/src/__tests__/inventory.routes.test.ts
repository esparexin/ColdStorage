import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { UserModel } from '../database/models/user.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('P5 Inventory Routes & RBAC Integration Tests', () => {
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;

  const facilityId = 'fac-routes-1';
  const otherFacilityId = 'fac-routes-2';
  const chamberId = 'ch-routes-1';
  const rackId = 'rk-routes-1';
  const levelId = 'lvl-routes-1';
  const posId = 'pos-routes-1';
  const customerId = 'cust-routes-1';
  const commodityId = 'cmd-routes-1';
  const grnId = 'grn-routes-1';

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
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await RackModel.deleteMany({});
    await LevelModel.deleteMany({});
    await PositionModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await UserModel.deleteMany({});
    await PutAwayAllocationModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});

    // 1. Facilities
    await FacilityModel.create([
      { id: facilityId, name: 'Main Facility', code: 'MAIN', isActive: true },
      { id: otherFacilityId, name: 'Other Facility', code: 'OTHR', isActive: true },
    ]);

    // 2. Storage hierarchy in Main Facility
    await ChamberModel.create({ id: chamberId, facilityId, chamberNumber: 'CH-1', isActive: true });
    await RackModel.create({ id: rackId, facilityId, chamberId, code: 'R1', isActive: true });
    await LevelModel.create({ id: levelId, facilityId, chamberId, rackId, levelNumber: 1, code: 'L1', isActive: true });
    await PositionModel.create({
      id: posId,
      facilityId,
      chamberId,
      rackId,
      levelId,
      code: 'R1-L1-P1',
      capacityBags: 100,
      isActive: true,
    });

    // 3. Customer & Commodity
    await CustomerModel.create({
      id: customerId,
      name: 'Kisan Traders',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });
    await CommodityModel.create({ id: commodityId, name: 'Onions', normalizedName: 'onions', isActive: true });

    // 4. GRN
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      inwardReceiptNumber: 'RCPT-25-26-0001',
      date: new Date(),
      customerId,
      customerName: 'Kisan Traders',
      commodityId,
      commodityName: 'Onions',
      chamberId,
      chamberNumber: 'CH-1',
      bags: 80,
      bagType: 'B',
      rentType: 'Seasonal',
      rentAmount: 3200,
      status: 'OPEN',
      createdBy: 'admin',
    });

    // 5. Users
    const passwordHash = await hashPassword('SecurePass123!');

    await UserModel.create([
      {
        id: 'usr-op',
        username: 'operator_main',
        employeeId: 'EMP-001',
        mobile: '9876543210',
        email: 'op@example.com',
        passwordHash,
        fullName: 'Main Operator',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ro',
        username: 'readonly_main',
        employeeId: 'EMP-002',
        mobile: '9876543211',
        email: 'ro@example.com',
        passwordHash,
        fullName: 'Main ReadOnly',
        role: 'READ_ONLY',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-op-other',
        username: 'operator_other',
        employeeId: 'EMP-003',
        mobile: '9876543212',
        email: 'other@example.com',
        passwordHash,
        fullName: 'Other Operator',
        role: 'OPERATOR',
        facilityIds: [otherFacilityId],
        isActive: true,
        mustChangePassword: false,
      },
    ]);

    const opLogin = await authService.login({ username: 'operator_main', password: 'SecurePass123!' });
    operatorToken = opLogin.accessToken;

    const roLogin = await authService.login({ username: 'readonly_main', password: 'SecurePass123!' });
    readOnlyToken = roLogin.accessToken;

    const otherLogin = await authService.login({ username: 'operator_other', password: 'SecurePass123!' });
    otherFacilityOperatorToken = otherLogin.accessToken;
  });

  it('allows OPERATOR to perform put-away allocation', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 50 }],
        notes: 'Operator allocation',
      });

    expect(res.status).toBe(201);
    expect(res.body.putAway.totalBags).toBe(50);
    expect(res.body.summary.allocatedBags).toBe(50);
    expect(res.body.summary.unallocatedBags).toBe(30);
    expect(res.body.summary.putAwayStatus).toBe('PARTIALLY_ALLOCATED');
  });

  it('rejects READ_ONLY user from performing put-away allocation (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({
        items: [{ positionId: posId, bags: 50 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("lacks permission 'rack:allocate'");
  });

  it('enforces facility-scoped isolation (user cannot access other facility)', async () => {
    // Other facility operator attempts to allocate in Main Facility
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 50 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection (rejects mismatched grnId)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/non-existent-grn/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 50 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in facility');
  });

  it('rejects duplicate position IDs in allocation request (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [
          { positionId: posId, bags: 20 },
          { positionId: posId, bags: 30 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('allows querying GRN allocation history and inventory summary', async () => {
    // 1. Allocate 40 bags
    await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 40 }],
      });

    // 2. Query allocation history
    const histRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.allocations).toHaveLength(1);
    expect(histRes.body.allocations[0].totalBags).toBe(40);

    // 3. Query summary
    const sumRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/inventory-summary`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(sumRes.status).toBe(200);
    expect(sumRes.body.summary.allocatedBags).toBe(40);
    expect(sumRes.body.summary.unallocatedBags).toBe(40);
    expect(sumRes.body.summary.putAwayStatus).toBe('PARTIALLY_ALLOCATED');
  });

  it('allows querying position occupancy and facility stock', async () => {
    // Allocate 30 bags
    await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 30 }],
      });

    // Query position occupancy
    const occRes = await request(app)
      .get(`/api/facilities/${facilityId}/positions/${posId}/occupancy`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(occRes.status).toBe(200);
    expect(occRes.body.occupancy.occupiedBags).toBe(30);
    expect(occRes.body.occupancy.availableBags).toBe(70);
    expect(occRes.body.occupancy.storedLots).toHaveLength(1);

    // Query facility summary
    const facRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(facRes.status).toBe(200);
    expect(facRes.body.summary.totalStockBags).toBe(30);
    expect(facRes.body.summary.byCommodity[0].commodityName).toBe('Onions');
  });

  it('allows querying filtered paginated stock ledger', async () => {
    await request(app)
      .post(`/api/facilities/${facilityId}/grns/${grnId}/allocations`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ positionId: posId, bags: 25 }],
      });

    const ledgerRes = await request(app)
      .get(`/api/facilities/${facilityId}/inventory/ledger?grnId=${grnId}&page=1&limit=10`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.total).toBe(1);
    expect(ledgerRes.body.items[0].quantity).toBe(25);
    expect(ledgerRes.body.items[0].transactionType).toBe('INWARD_PUTAWAY');
  });
});
