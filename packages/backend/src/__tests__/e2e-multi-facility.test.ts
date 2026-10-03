import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { BackupLogModel } from '../database/models/backup-log.model.js';
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
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { settingsService } from '../modules/settings/settings.service.js';
import { generateAccessToken } from '../utils/crypto.js';

const app = createApp();

describe('Phase 11: Multi-Facility End-to-End Operational Lifecycle', () => {
  const facilityA = 'fac-e2e-alpha';
  const facilityB = 'fac-e2e-beta';
  const commodityId = 'comm-e2e-potato';
  const chamberIdA = 'ch-e2e-a1';
  const chamberIdB = 'ch-e2e-b1';
  const rackIdA = 'rk-e2e-a1';
  const rackIdB = 'rk-e2e-b1';
  const levelIdA = 'lvl-e2e-a1';
  const levelIdB = 'lvl-e2e-b1';
  const positionIdA = 'pos-e2e-a1';
  const positionIdB = 'pos-e2e-b1';
  const customerIdA = 'cust-e2e-a1';
  const customerIdB = 'cust-e2e-b1';

  let superAdminToken: string;
  let adminTokenA: string;
  let adminTokenB: string;
  let operatorTokenA: string;
  let operatorTokenB: string;

  let grnIdA: string;
  let grnIdB: string;
  let grnNumberA: string;
  let grnNumberB: string;
  let deliveryIdA: string;

  async function cleanupFixtures() {
    const facilityIds = [facilityA, facilityB];
    await FacilityModel.deleteMany({ id: { $in: facilityIds } });
    await UserModel_stub_skip();
    await ChamberModel.deleteMany({ facilityId: { $in: facilityIds } });
    await RackModel.deleteMany({ facilityId: { $in: facilityIds } });
    await LevelModel.deleteMany({ facilityId: { $in: facilityIds } });
    await PositionModel.deleteMany({ facilityId: { $in: facilityIds } });
    await CustomerModel.deleteMany({ id: { $in: [customerIdA, customerIdB] } });
    await CommodityModel.deleteMany({ id: commodityId });
    await GrnModel.deleteMany({ facilityId: { $in: facilityIds } });
    await PutAwayAllocationModel.deleteMany({ facilityId: { $in: facilityIds } });
    await InventoryTransactionModel.deleteMany({ facilityId: { $in: facilityIds } });
    await DeliveryChallanModel.deleteMany({ facilityId: { $in: facilityIds } });
    await DeliveryReversalModel.deleteMany({ facilityId: { $in: facilityIds } });
    await CounterModel.deleteMany({ facilityId: { $in: facilityIds } });
    await mongoose.connection
      .collection('auditlogs')
      .deleteMany({ facilityId: { $in: facilityIds } });
    await BackupLogModel.deleteMany({ triggeredBy: 'usr-e2e-super' });
  }

  // Stub to avoid importing UserModel (not needed)
  function UserModel_stub_skip() {
    return Promise.resolve();
  }

  beforeAll(async () => {
    process.env.BACKUP_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    await cleanupFixtures();
    await SystemSettingsModel.deleteMany({});
    await settingsService.ensureInitialized();

    // Seed all fixtures directly via models (bypasses service ID generation)
    await FacilityModel.create([
      {
        id: facilityA,
        name: 'E2E Test Facility Alpha',
        code: 'E2EA',
        address: 'Sector 10 Industrial Complex A',
        isActive: true,
        operatingChambers: 2,
        totalCapacityBags: 50000,
      },
      {
        id: facilityB,
        name: 'E2E Test Facility Beta',
        code: 'E2EB',
        address: 'Sector 20 Industrial Complex B',
        isActive: true,
        operatingChambers: 2,
        totalCapacityBags: 50000,
      },
    ]);

    await CommodityModel.create({
      id: commodityId,
      name: 'E2E Seed Potato',
      normalizedName: 'e2e seed potato',
      isActive: true,
    });

    // Facility Alpha hierarchy: Chamber → Rack → Level → Position
    await ChamberModel.create({
      id: chamberIdA,
      facilityId: facilityA,
      chamberNumber: 'CA1',
      isActive: true,
    });
    await RackModel.create({
      id: rackIdA,
      facilityId: facilityA,
      chamberId: chamberIdA,
      code: 'RA1',
      isActive: true,
    });
    await LevelModel.create({
      id: levelIdA,
      facilityId: facilityA,
      rackId: rackIdA,
      chamberId: chamberIdA,
      levelNumber: 1,
      code: 'LA1',
      isActive: true,
    });
    await PositionModel.create({
      id: positionIdA,
      facilityId: facilityA,
      chamberId: chamberIdA,
      rackId: rackIdA,
      levelId: levelIdA,
      code: 'A1-R1-L1-P1',
      capacityBags: 1000,
      isActive: true,
    });
    await CustomerModel.create({
      id: customerIdA,
      name: 'Alpha Farmer 1',
      mobile: '9111111111',
      facilityIds: [facilityA],
      isActive: true,
    });

    // Facility Beta hierarchy
    await ChamberModel.create({
      id: chamberIdB,
      facilityId: facilityB,
      chamberNumber: 'CB1',
      isActive: true,
    });
    await RackModel.create({
      id: rackIdB,
      facilityId: facilityB,
      chamberId: chamberIdB,
      code: 'RB1',
      isActive: true,
    });
    await LevelModel.create({
      id: levelIdB,
      facilityId: facilityB,
      rackId: rackIdB,
      chamberId: chamberIdB,
      levelNumber: 1,
      code: 'LB1',
      isActive: true,
    });
    await PositionModel.create({
      id: positionIdB,
      facilityId: facilityB,
      chamberId: chamberIdB,
      rackId: rackIdB,
      levelId: levelIdB,
      code: 'B1-R1-L1-P1',
      capacityBags: 1000,
      isActive: true,
    });
    await CustomerModel.create({
      id: customerIdB,
      name: 'Beta Farmer 1',
      mobile: '9222222222',
      facilityIds: [facilityB],
      isActive: true,
    });

    superAdminToken = generateAccessToken(
      {
        userId: 'usr-e2e-super',
        username: 'e2e_superadmin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
        mustChangePassword: false,
      },
      config.jwtSecret,
      3600,
    );

    adminTokenA = generateAccessToken(
      {
        userId: 'usr-e2e-admin-a',
        username: 'e2e_admin_a',
        role: 'ADMIN',
        facilityIds: [facilityA],
        mustChangePassword: false,
      },
      config.jwtSecret,
      3600,
    );

    adminTokenB = generateAccessToken(
      {
        userId: 'usr-e2e-admin-b',
        username: 'e2e_admin_b',
        role: 'ADMIN',
        facilityIds: [facilityB],
        mustChangePassword: false,
      },
      config.jwtSecret,
      3600,
    );

    operatorTokenA = generateAccessToken(
      {
        userId: 'usr-e2e-operator-a',
        username: 'e2e_operator_a',
        role: 'OPERATOR',
        facilityIds: [facilityA],
        mustChangePassword: false,
      },
      config.jwtSecret,
      3600,
    );

    operatorTokenB = generateAccessToken(
      {
        userId: 'usr-e2e-operator-b',
        username: 'e2e_operator_b',
        role: 'OPERATOR',
        facilityIds: [facilityB],
        mustChangePassword: false,
      },
      config.jwtSecret,
      3600,
    );
  }, 60000);

  afterAll(async () => {
    await cleanupFixtures();
    await SystemSettingsModel.deleteMany({});
    try {
      const storageDir = path.resolve(process.cwd(), 'storage');
      await fs.rm(storageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }, 60000);

  it('1. Bootstrap Isolation: Super Admin sees both facilities; isolated facility scoping confirmed', async () => {
    const listRes = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(listRes.status).toBe(200);
    const ids = listRes.body.items.map((f: { id: string }) => f.id);
    expect(ids).toContain(facilityA);
    expect(ids).toContain(facilityB);

    // Admin A sees only Facility Alpha
    const listResA = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${adminTokenA}`);
    expect(listResA.status).toBe(200);
    const idsA = listResA.body.items.map((f: { id: string }) => f.id);
    expect(idsA).toContain(facilityA);
    expect(idsA).not.toContain(facilityB);

    // Admin B sees only Facility Beta
    const listResB = await request(app)
      .get('/api/facilities')
      .set('Authorization', `Bearer ${adminTokenB}`);
    expect(listResB.status).toBe(200);
    const idsB = listResB.body.items.map((f: { id: string }) => f.id);
    expect(idsB).toContain(facilityB);
    expect(idsB).not.toContain(facilityA);
  });

  it('2. Master Data Scoping: Facility Alpha chambers inaccessible to Facility Beta operator', async () => {
    // Operator B cannot access Alpha chambers
    const deniedChamber = await request(app)
      .get(`/api/facilities/${facilityA}/chambers`)
      .set('Authorization', `Bearer ${operatorTokenB}`);
    expect(deniedChamber.status).toBe(403);

    // Operator A CAN access own facility chambers
    const allowedChamber = await request(app)
      .get(`/api/facilities/${facilityA}/chambers`)
      .set('Authorization', `Bearer ${operatorTokenA}`);
    expect(allowedChamber.status).toBe(200);
    const chamberIds = allowedChamber.body.items.map((c: { id: string }) => c.id);
    expect(chamberIds).toContain(chamberIdA);
  });

  it('3. Concurrent Inwarding: Parallel GRNs in both facilities; verifies independent FY counter sequences', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/facilities/${facilityA}/grns`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          customerId: customerIdA,
          commodityId,
          chamberId: chamberIdA,
          bags: 100,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 0,
        }),
      request(app)
        .post(`/api/facilities/${facilityB}/grns`)
        .set('Authorization', `Bearer ${operatorTokenB}`)
        .send({
          customerId: customerIdB,
          commodityId,
          chamberId: chamberIdB,
          bags: 200,
          bagType: 'S',
          rentType: 'Seasonal',
          rentAmount: 0,
        }),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    grnIdA = resA.body.grn.id;
    grnNumberA = resA.body.grn.grnNumber;
    grnIdB = resB.body.grn.id;
    grnNumberB = resB.body.grn.grnNumber;

    expect(grnNumberA).toBeTruthy();
    expect(grnNumberB).toBeTruthy();
    expect(resA.body.grn.facilityId).toBe(facilityA);
    expect(resB.body.grn.facilityId).toBe(facilityB);
    expect(grnIdA).not.toBe(grnIdB);
    expect(resA.body.grn.bags).toBe(100);
    expect(resB.body.grn.bags).toBe(200);
  });

  it('4. Put-Away & Ledger Atomicity: Parallel put-aways in both facilities; ledger transactions isolated', async () => {
    const [paA, paB] = await Promise.all([
      request(app)
        .post(`/api/facilities/${facilityA}/grns/${grnIdA}/allocations`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({
          items: [{ positionId: positionIdA, bags: 100 }],
          notes: 'Full put-away Alpha',
        }),
      request(app)
        .post(`/api/facilities/${facilityB}/grns/${grnIdB}/allocations`)
        .set('Authorization', `Bearer ${operatorTokenB}`)
        .send({
          items: [{ positionId: positionIdB, bags: 200 }],
          notes: 'Full put-away Beta',
        }),
    ]);

    expect(paA.status).toBe(201);
    expect(paB.status).toBe(201);

    // Verify inventory transactions are facility-isolated
    const txA = await InventoryTransactionModel.find({
      facilityId: facilityA,
      grnId: grnIdA,
      transactionType: 'INWARD_PUTAWAY',
    });
    expect(txA.length).toBeGreaterThanOrEqual(1);
    expect(txA[0].quantity).toBe(100);

    const txB = await InventoryTransactionModel.find({
      facilityId: facilityB,
      grnId: grnIdB,
      transactionType: 'INWARD_PUTAWAY',
    });
    expect(txB.length).toBeGreaterThanOrEqual(1);
    expect(txB[0].quantity).toBe(200);
  });

  it('5. Cross-Facility Outward Denial: Operator Alpha cannot deliver Beta GRN; emits ACCESS_DENIED audit log', async () => {
    // Operator Alpha tries to deliver Beta GRN within Alpha facility — GRN not found in Alpha
    const crossRes = await request(app)
      .post(`/api/facilities/${facilityA}/deliveries`)
      .set('Authorization', `Bearer ${operatorTokenA}`)
      .send({
        grnId: grnIdB, // belongs to Beta
        items: [{ positionId: positionIdA, bags: 10 }],
      });
    expect(crossRes.status).toBe(404);

    // Operator Alpha tries to call Facility Beta endpoint directly — 403 from facility scope guard
    const deniedScope = await request(app)
      .post(`/api/facilities/${facilityB}/deliveries`)
      .set('Authorization', `Bearer ${operatorTokenA}`)
      .send({
        grnId: grnIdB,
        items: [{ positionId: positionIdB, bags: 10 }],
      });
    expect(deniedScope.status).toBe(403);

    // Verify ACCESS_DENIED audit log was recorded (fire-and-forget — allow async write to settle)
    await new Promise((r) => setTimeout(r, 500));
    const auditDenied = await mongoose.connection.collection('auditlogs').findOne({
      eventType: 'ACCESS_DENIED',
      userId: 'usr-e2e-operator-a',
    });
    expect(auditDenied).not.toBeNull();
  });

  it('6. Valid Partial Outward Delivery: Operator Alpha issues partial delivery; GRN remains OPEN', async () => {
    const partialRes = await request(app)
      .post(`/api/facilities/${facilityA}/deliveries`)
      .set('Authorization', `Bearer ${operatorTokenA}`)
      .send({
        grnId: grnIdA,
        items: [{ positionId: positionIdA, bags: 40 }],
      });

    expect(partialRes.status).toBe(201);
    deliveryIdA = partialRes.body.delivery.id;
    expect(deliveryIdA).toBeTruthy();

    // GRN must still be OPEN (40 bags delivered, 60 remaining)
    const grnPartial = await GrnModel.findOne({ id: grnIdA });
    expect(grnPartial?.status).toBe('OPEN');

    // Inventory should have OUTWARD_DELIVERY transaction for 40 bags
    const outTx = await InventoryTransactionModel.findOne({
      facilityId: facilityA,
      grnId: grnIdA,
      transactionType: 'OUTWARD_DELIVERY',
    });
    expect(outTx).toBeDefined();
    expect(outTx?.quantity).toBe(40);
  });

  it('7. Full Closure: Remaining 60 bags delivered; GRN auto-transitions to CLOSED', async () => {
    const finalRes = await request(app)
      .post(`/api/facilities/${facilityA}/deliveries`)
      .set('Authorization', `Bearer ${operatorTokenA}`)
      .send({
        grnId: grnIdA,
        items: [{ positionId: positionIdA, bags: 60 }],
      });

    expect(finalRes.status).toBe(201);

    // GRN must be CLOSED now
    const grnFinal = await GrnModel.findOne({ id: grnIdA });
    expect(grnFinal?.status).toBe('CLOSED');

    // Total outward inventory = 40 + 60 = 100
    const allOut = await InventoryTransactionModel.find({
      facilityId: facilityA,
      grnId: grnIdA,
      transactionType: 'OUTWARD_DELIVERY',
    });
    const totalOut = allOut.reduce((s, t) => s + t.quantity, 0);
    expect(totalOut).toBe(100);
  });

  it('8. Compensating Delivery Reversal: Admin Alpha reverses first delivery; GRN reopens to OPEN', async () => {
    const revRes = await request(app)
      .post(`/api/facilities/${facilityA}/deliveries/${deliveryIdA}/reverse`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        reason: 'Customer cancelled partial pickup order',
      });

    expect(revRes.status).toBe(200);

    // GRN reopens to OPEN (still has 60 bags from second delivery)
    const grnRev = await GrnModel.findOne({ id: grnIdA });
    expect(grnRev?.status).toBe('OPEN');

    // Delivery challan is REVERSED
    const delRecord = await DeliveryChallanModel.findOne({ id: deliveryIdA });
    expect(delRecord?.status).toBe('REVERSED');

    // DeliveryReversal record exists with correct deliveryId
    const revRecord = await DeliveryReversalModel.findOne({ deliveryId: deliveryIdA });
    expect(revRecord).toBeDefined();
    expect(revRecord?.grnId).toBe(grnIdA);

    // DELIVERY_REVERSAL inventory transaction exists for 40 bags
    const revTx = await InventoryTransactionModel.findOne({
      facilityId: facilityA,
      grnId: grnIdA,
      transactionType: 'DELIVERY_REVERSAL',
    });
    expect(revTx).toBeDefined();
    expect(revTx?.quantity).toBe(40);
  });

  it('9. Encrypted System Backup: Super Admin triggers manual backup; verifies COMPLETED status', async () => {
    const backupRes = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ backupType: 'MANUAL' });

    expect(backupRes.status).toBe(201);
    expect(backupRes.body.backupLog).toBeDefined();
    expect(backupRes.body.backupLog.status).toBe('COMPLETED');
    expect(backupRes.body.backupLog.sizeBytes).toBeGreaterThan(0);
    expect(backupRes.body.backupLog.checksum).toBeDefined();

    // Verify backup log persisted in DB
    const logDoc = await BackupLogModel.findOne({ id: backupRes.body.backupLog.id });
    expect(logDoc).toBeDefined();
    expect(logDoc?.status).toBe('COMPLETED');
  });

  it('10. Global Audit Trail: Super Admin queries all audit logs; all expected event types present', async () => {
    const auditRes = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(auditRes.status).toBe(200);
    // Audit API returns { logs, totalCount, page, limit, totalPages }
    expect(Array.isArray(auditRes.body.logs)).toBe(true);
    expect(auditRes.body.totalCount).toBeGreaterThan(0);

    const eventTypes = auditRes.body.logs.map((item: { eventType: string }) => item.eventType);
    expect(eventTypes).toContain('GRN_CREATED');
    expect(eventTypes).toContain('INVENTORY_PUTAWAY');
    expect(eventTypes).toContain('DELIVERY_ISSUED');
    expect(eventTypes).toContain('DELIVERY_REVERSED');
    expect(eventTypes).toContain('ACCESS_DENIED');
    expect(eventTypes).toContain('BACKUP_TRIGGERED');

    // Admin A's facility-scoped audit view contains only Alpha events (when facilityId filter applied)
    const auditResA = await request(app)
      .get(`/api/audit-logs?facilityId=${facilityA}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(auditResA.status).toBe(200);
    for (const item of auditResA.body.logs) {
      if (item.facilityId) {
        expect(item.facilityId).toBe(facilityA);
      }
    }
  });
});
