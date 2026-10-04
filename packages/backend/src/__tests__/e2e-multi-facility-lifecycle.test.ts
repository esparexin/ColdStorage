import { promises as fs } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { BackupLogModel } from '../database/models/backup-log.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { settingsService } from '../modules/settings/settings.service.js';
import {
  cleanupMultiFacilityScenario,
  seedMultiFacilityScenario,
  type MultiFacilityScenario,
} from './helpers/multi-facility-e2e-fixtures.js';

const app = createApp();
const CHAMBER = 'CL1';

/**
 * Phase 11 multi-facility end-to-end: the outward operational lifecycle.
 *
 * Put-away confirms a GRN's whole lot in its own free-text chamber and delivery withdraws a
 * single bag count, so inward 100 → outward 40 → outward 60 → reversal drives the full
 * OPEN → CLOSED → OPEN transition with the immutable ledger as the source of truth.
 * The cross-facility isolation guarantees live in e2e-multi-facility.test.ts.
 */
describe('Phase 11: Multi-Facility End-to-End — outward lifecycle, backup and audit', () => {
  let scenario: MultiFacilityScenario;
  let grnId: string;
  let deliveryId: string;

  beforeAll(async () => {
    // config is the environment SSOT and snapshots process.env at module load, so a key set
    // after import has no effect. Tests must therefore seed the config object directly.
    config.backupEncryptionKey =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    await connectToDatabase();

    await SystemSettingsModel.deleteMany({});
    await settingsService.ensureInitialized();
    scenario = await seedMultiFacilityScenario('e2elc');
  }, 60000);

  afterAll(async () => {
    await cleanupMultiFacilityScenario(scenario);
    await SystemSettingsModel.deleteMany({});
    await fs.rm(path.resolve(process.cwd(), 'storage'), { recursive: true, force: true });
    await disconnectDatabase();
  }, 60000);

  it('1. Whole-lot put-away then partial delivery: GRN stays OPEN with 60 bags outstanding', async () => {
    const grnRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/grns`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({
        customerId: scenario.customerA,
        commodityId: scenario.commodityId,
        chamber: CHAMBER,
        bags: 100,
        bagType: 'S',
        smallBagWeight: 50,
        rentType: 'Seasonal',
        rentAmount: 0,
      });
    expect(grnRes.status).toBe(201);
    grnId = grnRes.body.grn.id;

    const invRes = await request(app)
      .get(`/api/facilities/${scenario.facilityA}/grns/${grnId}/inventory-summary`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`);
    expect(invRes.status).toBe(200);
    expect(invRes.body.summary.putAwayStatus).toBe('ALLOCATED');
    expect(invRes.body.summary.chamber).toBe(CHAMBER);

    const partialRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/deliveries`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ grnId, bags: 40 });
    expect(partialRes.status).toBe(201);
    deliveryId = partialRes.body.delivery.id;
    expect(partialRes.body.delivery.totalBags).toBe(40);
    expect(partialRes.body.summary.remainingDeliveryBalance).toBe(60);
    expect(partialRes.body.summary.physicallyStoredBags).toBe(60);
    expect(partialRes.body.summary.grnStatus).toBe('OPEN');

    const grnAfterPartial = await GrnModel.findOne({ id: grnId });
    expect(grnAfterPartial?.status).toBe('OPEN');

    const outTx = await InventoryTransactionModel.findOne({
      facilityId: scenario.facilityA,
      grnId,
      transactionType: 'OUTWARD_DELIVERY',
    });
    expect(outTx?.quantity).toBe(40);
    expect(outTx?.chamber).toBe(CHAMBER);
  });

  it('2. Full closure: delivering the remaining bags auto-transitions the GRN to CLOSED', async () => {
    const finalRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/deliveries`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ grnId, bags: 60 });
    expect(finalRes.status).toBe(201);
    expect(finalRes.body.summary.grnStatus).toBe('CLOSED');
    expect(finalRes.body.summary.remainingDeliveryBalance).toBe(0);

    const grnFinal = await GrnModel.findOne({ id: grnId });
    expect(grnFinal?.status).toBe('CLOSED');

    const outward = await InventoryTransactionModel.find({
      facilityId: scenario.facilityA,
      grnId,
      transactionType: 'OUTWARD_DELIVERY',
    });
    expect(outward.reduce((sum, t) => sum + t.quantity, 0)).toBe(100);
  });

  it('3. Compensating reversal: Admin reverses the first challan and the GRN reopens', async () => {
    const operatorAttempt = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${scenario.tokens.operatorA}`)
      .send({ reason: 'Operator must not reverse a challan' });
    expect(operatorAttempt.status).toBe(403);

    const revRes = await request(app)
      .post(`/api/facilities/${scenario.facilityA}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`)
      .send({ reason: 'Customer cancelled partial pickup order' });
    expect(revRes.status).toBe(200);
    expect(revRes.body.challan.status).toBe('REVERSED');

    const grnReopened = await GrnModel.findOne({ id: grnId });
    expect(grnReopened?.status).toBe('OPEN');

    const reversalDoc = await DeliveryReversalModel.findOne({ deliveryId });
    expect(reversalDoc?.grnId).toBe(grnId);

    const reversalTx = await InventoryTransactionModel.findOne({
      facilityId: scenario.facilityA,
      grnId,
      transactionType: 'DELIVERY_REVERSAL',
    });
    expect(reversalTx?.quantity).toBe(40);

    const challans = await DeliveryChallanModel.find({ facilityId: scenario.facilityA, grnId });
    expect(challans.map((c) => c.status).sort()).toEqual(['ISSUED', 'REVERSED']);
  });

  it('4. Encrypted backup: Super Admin completes a manual backup; Admin is denied', async () => {
    const backupRes = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${scenario.tokens.superAdmin}`)
      .send({ backupType: 'MANUAL' });
    expect(backupRes.status).toBe(201);
    expect(backupRes.body.backupLog.status).toBe('COMPLETED');
    expect(backupRes.body.backupLog.sizeBytes).toBeGreaterThan(0);
    expect(backupRes.body.backupLog.checksum).toBeTruthy();

    const logDoc = await BackupLogModel.findOne({ id: backupRes.body.backupLog.id });
    expect(logDoc?.status).toBe('COMPLETED');

    const deniedRes = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`)
      .send({ backupType: 'MANUAL' });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.error).toContain("lacks permission 'backup:manage'");
  });

  it('5. Audit trail: global for Super Admin, strictly facility-scoped for Admin', async () => {
    const superRes = await request(app)
      .get(`/api/audit-logs?facilityId=${scenario.facilityA}&limit=100`)
      .set('Authorization', `Bearer ${scenario.tokens.superAdmin}`);
    expect(superRes.status).toBe(200);
    expect(superRes.body.totalCount).toBeGreaterThan(0);
    const eventTypes = superRes.body.logs.map((item: { eventType: string }) => item.eventType);
    expect(eventTypes).toContain('GRN_CREATED');
    expect(eventTypes).toContain('DELIVERY_ISSUED');
    expect(eventTypes).toContain('DELIVERY_REVERSED');

    const adminRes = await request(app)
      .get(`/api/audit-logs?facilityId=${scenario.facilityA}&limit=100`)
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`);
    expect(adminRes.status).toBe(200);
    for (const item of adminRes.body.logs as { facilityId: string | null }[]) {
      expect(item.facilityId).toBe(scenario.facilityA);
    }

    const foreignRes = await request(app)
      .get(`/api/audit-logs?facilityId=${scenario.facilityB}`)
      .set('Authorization', `Bearer ${scenario.tokens.adminA}`);
    expect(foreignRes.status).toBe(403);

    const backupAudit = await AuditLogModel.findOne({
      eventType: 'BACKUP_TRIGGERED',
      userId: scenario.userIds[0],
    });
    expect(backupAudit).not.toBeNull();
  });
});
