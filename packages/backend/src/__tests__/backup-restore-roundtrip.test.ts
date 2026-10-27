import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { collectBackupEntities } from '../modules/backup/backup-collector.js';
import { restoreBackup } from '../modules/backup/backup-restore.service.js';
import {
  makeStorageDir,
  RT,
  ROUNDTRIP_BACKUP_ID as backupId,
  ROUNDTRIP_KEY as validHexKey,
  seedRoundtripRows,
  wipeArchiveRow,
  wipeSeededRows,
  writeArchive,
} from './helpers/backup-roundtrip-fixtures.js';

/**
 * End-to-end proof that a real archive restores every collection (W1.4).
 *
 * This is the acceptance test behind "restore round-trips 17/17". It builds a
 * real encrypted archive on disk, registers a completed BackupLog row, then
 * runs the real `restoreBackup` and asserts the documents come back.
 *
 * Three collections previously restored nothing while the call still succeeded
 * with HTTP 200 and a zero count: SystemSettings, Facility and Commodity. Two
 * further defects were found by writing this test and are fixed alongside:
 *   - SystemSettings and Counter both declare no `id` field, so keying them on
 *     `id` skipped every document.
 *   - AuditLog and RentPayment register a blocking updateOne hook, so any
 *     archive containing them aborted the restore part-way.
 */
describe('backup restore round-trips every collection', { timeout: 20000 }, () => {
  let storageDir: string;

  beforeAll(async () => {
    config.backupEncryptionKey = validHexKey;
    config.backupAllowLiveRestore = true; // target is cold_storage_test, not live
    await connectToDatabase();
    storageDir = await makeStorageDir();
  });

  afterAll(async () => {
    try {
      await fs.rm(path.resolve(process.cwd(), 'storage'), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await wipeArchiveRow();
    await wipeSeededRows();
  });

  it('restores SystemSettings, Facility and Commodity - the three silent-loss collections', async () => {
    await seedRoundtripRows();
    await writeArchive(storageDir);
    await wipeSeededRows();

    expect(await FacilityModel.countDocuments({ id: RT.facilityId })).toBe(0);
    expect(await CommodityModel.countDocuments({ id: RT.commodityId })).toBe(0);
    expect(await SystemSettingsModel.countDocuments({ _id: 'SYSTEM_SETTINGS' })).toBe(0);

    const result = await restoreBackup(
      'user-rt',
      { backupId, confirm: backupId, dryRun: false },
      validHexKey,
    );

    expect(result.dryRun).toBe(false);
    expect(result.targetDatabase).toBe('cold_storage_test');

    // Counts are asserted relative to the archive rather than to an absolute 1:
    // this suite shares cold_storage_test with the other backup tests, so the
    // archive legitimately contains rows seeded elsewhere.
    for (const key of ['systemSettings', 'facilities', 'commodities', 'counters']) {
      expect(result.upsertedCounts?.[key], key).toBe(result.entityCounts[key]);
      expect(result.upsertedCounts?.[key], key).toBeGreaterThanOrEqual(1);
    }

    const settings = await SystemSettingsModel.findOne({ _id: 'SYSTEM_SETTINGS' }).lean().exec();
    expect(settings?.orgName).toBe('Roundtrip Org');
    const facility = await FacilityModel.findOne({ id: RT.facilityId }).lean().exec();
    expect(facility?.name).toBe('RT Facility');
    const commodity = await CommodityModel.findOne({ id: RT.commodityId }).lean().exec();
    expect(commodity?.name).toBe('RT Commodity');
  });

  it('reports a non-zero count for every non-empty collection in the archive', async () => {
    await seedRoundtripRows();
    await writeArchive(storageDir);
    await wipeSeededRows();

    const result = await restoreBackup(
      'user-rt',
      { backupId, confirm: backupId, dryRun: false },
      validHexKey,
    );

    const counts = result.upsertedCounts ?? {};
    const expected = Object.entries(result.entityCounts).filter(([, n]) => n > 0);
    expect(expected.length).toBeGreaterThanOrEqual(5);
    for (const [key, archived] of expected) {
      expect(counts[key], `collection ${key} restored nothing`).toBe(archived);
    }
  });

  it('restores the immutability-guarded collections (AuditLog, RentPayment)', async () => {
    await seedRoundtripRows();
    await writeArchive(storageDir, async () => {
      await RentPaymentModel.create({
        id: RT.rentPaymentId,
        facilityId: RT.facilityId,
        grnId: 'grn-rt-1',
        grnNumber: '0001',
        receiptNumber: 'RRCPT-2026-27-0001',
        paymentDate: new Date(),
        amountPaid: 1000,
        paymentMode: 'Cash',
        createdBy: 'user-rt',
      } as never);
      await AuditLogModel.create({
        id: RT.auditLogId,
        eventType: 'GRN_CREATED',
        severity: 'INFO',
        userId: 'user-rt',
        username: 'rt-user',
        userRole: 'SUPER_ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        resource: 'grn',
        resourceId: 'grn-rt-1',
        timestamp: new Date(),
        details: { probe: true },
      } as never);
    });

    // Re-archive so the guarded rows are inside the file.
    const entities = await collectBackupEntities();
    expect((entities['rentPayments'] as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect((entities['auditLogs'] as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(1);

    await mongoose.connection
      .collection('rentpayments')
      .deleteMany({ id: RT.rentPaymentId });
    await mongoose.connection.collection('auditlogs').deleteMany({ id: RT.auditLogId });
    expect(
      await mongoose.connection.collection('rentpayments').countDocuments({ id: RT.rentPaymentId }),
    ).toBe(0);

    const result = await restoreBackup(
      'user-rt',
      { backupId, confirm: backupId, dryRun: false },
      validHexKey,
    );

    expect(result.upsertedCounts?.['rentPayments']).toBe(result.entityCounts['rentPayments']);
    expect(result.upsertedCounts?.['auditLogs']).toBe(result.entityCounts['auditLogs']);
    expect(
      await mongoose.connection.collection('rentpayments').countDocuments({ id: RT.rentPaymentId }),
    ).toBe(1);
    expect(
      await mongoose.connection.collection('auditlogs').countDocuments({ id: RT.auditLogId }),
    ).toBe(1);
  });

  it('is atomic: a rejected restore leaves nothing behind', async () => {
    await seedRoundtripRows();
    await writeArchive(storageDir);
    await wipeSeededRows();
    const before = await FacilityModel.countDocuments({});

    await expect(
      restoreBackup('user-rt', { backupId, confirm: 'wrong-id', dryRun: false }, validHexKey),
    ).rejects.toThrow(/RESTORE_CONFIRM_MISMATCH/);

    expect(await FacilityModel.countDocuments({})).toBe(before);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('dry-run reports the full entity inventory without writing', async () => {
    await seedRoundtripRows();
    await writeArchive(storageDir);
    await wipeSeededRows();

    const result = await restoreBackup(
      'user-rt',
      { backupId, confirm: backupId, dryRun: true },
      validHexKey,
    );

    expect(result.dryRun).toBe(true);
    expect(result.upsertedCounts).toBeUndefined();
    expect(result.entityCounts['systemSettings']).toBeGreaterThanOrEqual(1);
    expect(result.entityCounts['facilities']).toBeGreaterThanOrEqual(1);
    expect(result.entityCounts['commodities']).toBeGreaterThanOrEqual(1);
    expect(await FacilityModel.countDocuments({ id: RT.facilityId })).toBe(0);
  });
});