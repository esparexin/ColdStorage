import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { UserModel } from '../database/models/user.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('P6 Delivery Routes & RBAC Integration Tests', () => {
  let superAdminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;

  const facilityId = 'fac-del-routes-1';
  const otherFacilityId = 'fac-del-routes-2';
  const chamberId = 'ch-del-routes-1';
  const rackId = 'rk-del-routes-1';
  const levelId = 'lvl-del-routes-1';
  const posId = 'pos-del-routes-1';
  const customerId = 'cust-del-routes-1';
  const commodityId = 'cmd-del-routes-1';
  const grnId = 'grn-del-routes-1';

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
    await CounterModel.deleteMany({});
    await UserModel.deleteMany({});
    await PutAwayAllocationModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await DeliveryReversalModel.deleteMany({});

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

    // 4. GRN with 80 bags
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
      rentAmount: 0,
      status: 'OPEN',
      createdBy: 'admin',
    });

    // 5. Put away 50 bags into posId
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      { items: [{ positionId: posId, bags: 50 }] },
      'admin',
    );

    // 6. Users
    const passwordHash = await hashPassword('SecurePass123!');

    await UserModel.create([
      {
        id: 'usr-admin',
        username: 'superadmin_main',
        employeeId: 'EMP-SA',
        mobile: '9876543200',
        email: 'sa@example.com',
        passwordHash,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-op',
        username: 'operator_del',
        employeeId: 'EMP-DEL-1',
        mobile: '9876543201',
        email: 'op_del@example.com',
        passwordHash,
        fullName: 'Delivery Operator',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ro',
        username: 'readonly_del',
        employeeId: 'EMP-DEL-2',
        mobile: '9876543202',
        email: 'ro_del@example.com',
        passwordHash,
        fullName: 'Delivery ReadOnly',
        role: 'READ_ONLY',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-op-other',
        username: 'operator_other_del',
        employeeId: 'EMP-DEL-3',
        mobile: '9876543203',
        email: 'other_del@example.com',
        passwordHash,
        fullName: 'Other Facility Operator',
        role: 'OPERATOR',
        facilityIds: [otherFacilityId],
        isActive: true,
        mustChangePassword: false,
      },
    ]);

    const saLogin = await authService.login({ username: 'superadmin_main', password: 'SecurePass123!' });
    superAdminToken = saLogin.accessToken;

    const opLogin = await authService.login({ username: 'operator_del', password: 'SecurePass123!' });
    operatorToken = opLogin.accessToken;

    const roLogin = await authService.login({ username: 'readonly_del', password: 'SecurePass123!' });
    readOnlyToken = roLogin.accessToken;

    const otherLogin = await authService.login({ username: 'operator_other_del', password: 'SecurePass123!' });
    otherFacilityOperatorToken = otherLogin.accessToken;
  });

  it('allows OPERATOR to issue outward delivery challan', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 30 }],
        vehicleNumber: 'MH12AB1234',
        driverName: 'Ramu',
        remarks: 'First partial delivery',
      });

    expect(res.status).toBe(201);
    expect(res.body.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.body.delivery.totalBags).toBe(30);
    expect(res.body.summary.remainingDeliveryBalance).toBe(50);
    expect(res.body.summary.physicallyStoredBags).toBe(20);
    expect(res.body.summary.grnStatus).toBe('OPEN');
  });

  it('rejects READ_ONLY user from creating delivery (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 20 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("lacks permission 'delivery:create'");
  });

  it('enforces facility-scoped isolation on delivery creation', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 20 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection when grnId belongs to another facility', async () => {
    const res = await request(app)
      .post(`/api/facilities/${otherFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({
        grnId, // grnId belongs to facilityId, not otherFacilityId!
        items: [{ positionId: posId, bags: 10 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in facility');
  });

  it('allows SUPER_ADMIN to perform full delivery reversal', async () => {
    // 1. Create delivery
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 25 }],
      });

    const deliveryId = delRes.body.delivery.id;

    // 2. Reverse delivery
    const revRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        reason: 'Customer rejected quality after dispatch',
      });

    expect(revRes.status).toBe(200);
    expect(revRes.body.reversal.deliveryId).toBe(deliveryId);
    expect(revRes.body.challan.status).toBe('REVERSED');
    expect(revRes.body.summary.remainingDeliveryBalance).toBe(80);
    expect(revRes.body.summary.physicallyStoredBags).toBe(50);
  });

  it('rejects OPERATOR from performing delivery reversal (403 Forbidden)', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 20 }],
      });

    const deliveryId = delRes.body.delivery.id;

    const revRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        reason: 'Operator attempt to reverse',
      });

    expect(revRes.status).toBe(403);
    expect(revRes.body.error).toContain("lacks permission 'delivery:reversal'");
  });

  it('allows querying delivery list, single delivery, and GRN delivery history', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        items: [{ positionId: posId, bags: 15 }],
      });

    const deliveryId = delRes.body.delivery.id;

    // 1. List deliveries
    const listRes = await request(app)
      .get(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.total).toBe(1);

    // 2. Get single delivery
    const singleRes = await request(app)
      .get(`/api/facilities/${facilityId}/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(singleRes.status).toBe(200);
    expect(singleRes.body.delivery.id).toBe(deliveryId);

    // 3. Get deliveries for GRN
    const grnDelRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`);

    expect(grnDelRes.status).toBe(200);
    expect(grnDelRes.body.deliveries).toHaveLength(1);
  });
});
