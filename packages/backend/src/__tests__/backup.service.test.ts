import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BackupLogModel } from '../database/models/backup-log.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { backupService } from '../modules/backup/backup.service.js';
import { LocalEncryptedStorageDriver } from '../modules/backup/storage/storage.driver.js';

describe('Suite 4: Backup Service & Encryption — backup.service.test.ts', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testStorageDir = path.resolve(process.cwd(), 'storage/test-backups');

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
    backupService.setStorageDriver(new LocalEncryptedStorageDriver(testStorageDir));
  });

  afterAll(async () => {
    try {
      const storageDir = path.resolve(process.cwd(), 'storage');
      await fs.rm(storageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await BackupLogModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});

    // Ensure default system settings with backup enabled
    await SystemSettingsModel.create({
      _id: 'SYSTEM_SETTINGS',
      orgName: 'Himachal Cold Storage',
      address: 'Shimla Highway',
      contact: '9876543210',
      backupPolicy: {
        atlasRetentionDays: 7,
        driveRetentionDays: 30,
        driveBackupEnabled: true,
      },
    });
  });

  // 1. Executes backup and outputs valid AES-256-GCM encrypted file with prepended IV and auth tag
  it('executes backup and outputs valid AES-256-GCM encrypted file', async () => {
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    expect(result.backupLog.status).toBe('COMPLETED');
    expect(result.backupLog.sizeBytes).toBeGreaterThan(28); // 12 IV + 16 AuthTag + data

    const fileBuffer = await fs.readFile(result.backupLog.storageLocation);
    expect(fileBuffer.length).toBe(result.backupLog.sizeBytes);
  });

  // 2. Successfully decrypts backup archive using valid master key and verifies JSON integrity
  it('successfully decrypts backup archive using valid master key and verifies integrity', async () => {
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    const fileBuffer = await fs.readFile(result.backupLog.storageLocation);

    const decrypted = backupService.decryptBackupArchive(fileBuffer, testKey) as {
      metadata: { format: string; version: string };
      entities: { systemSettings: unknown[] };
    };

    expect(decrypted.metadata.format).toBe('COLD_STORAGE_BACKUP');
    expect(decrypted.entities.systemSettings).toBeDefined();
    expect(decrypted.entities.systemSettings.length).toBeGreaterThan(0);
  });

  // 3. Rejects decryption with invalid master key or tampered ciphertext (auth tag mismatch)
  it('rejects decryption with invalid master key or tampered ciphertext', async () => {
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    const fileBuffer = await fs.readFile(result.backupLog.storageLocation);

    const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    expect(() => backupService.decryptBackupArchive(fileBuffer, wrongKey)).toThrow();

    // Tamper ciphertext
    const tampered = Buffer.from(fileBuffer);
    tampered[tampered.length - 1] ^= 0xff; // flip last byte
    expect(() => backupService.decryptBackupArchive(tampered, testKey)).toThrow();
  });

  // 4. Correctly sets retentionExpiresAt based on SystemSettings.backupPolicy.driveRetentionDays
  it('correctly sets retentionExpiresAt based on backupPolicy', async () => {
    const before = Date.now();
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    const expiresAt = new Date(result.backupLog.retentionExpiresAt).getTime();

    // Expected ~30 days in future
    const expectedApprox = before + 30 * 86400 * 1000;
    expect(Math.abs(expiresAt - expectedApprox)).toBeLessThan(5000);
  });

  // 5. Rejects backup execution when driveBackupEnabled is false
  it('rejects backup execution when driveBackupEnabled is false', async () => {
    await SystemSettingsModel.updateOne(
      { _id: 'SYSTEM_SETTINGS' },
      { $set: { 'backupPolicy.driveBackupEnabled': false } },
    );

    await expect(backupService.triggerManualBackup('usr-sa', testKey)).rejects.toThrow(
      /BACKUP_DISABLED/i,
    );
  });

  // 6. Generates valid SHA-256 checksum and accurate byte count for the backup archive
  it('generates valid SHA-256 checksum and accurate byte count', async () => {
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    expect(result.backupLog.checksum).toBeDefined();
    expect(result.backupLog.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.backupLog.sizeBytes).toBeGreaterThan(0);
  });

  // 7. Records backup log entry with status COMPLETED on successful execution
  it('records backup log entry with status COMPLETED on successful execution', async () => {
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    const logInDb = await BackupLogModel.findOne({ id: result.backupLog.id }).lean();
    expect(logInDb?.status).toBe('COMPLETED');
    expect(logInDb?.triggeredBy).toBe('usr-sa');
  });

  // 8. Records backup log entry with status FAILED on pipeline error
  it('records backup log entry with status FAILED on key error', async () => {
    await expect(backupService.triggerManualBackup('usr-sa', 'invalid_short_key')).rejects.toThrow(
      /BACKUP_KEY_INVALID/i,
    );

    const failedLog = await BackupLogModel.findOne({ status: 'FAILED' }).lean();
    expect(failedLog).toBeDefined();
    expect(failedLog?.errorMessage).toMatch(/BACKUP_KEY_INVALID/i);
  });

  // 9. Rejects concurrent backup trigger with conflict error when a backup is in progress
  it('rejects concurrent backup trigger with conflict error when a backup is in progress', async () => {
    // Trigger two in parallel
    const p1 = backupService.triggerManualBackup('usr-sa', testKey);
    const p2 = backupService.triggerManualBackup('usr-sa', testKey);

    const results = await Promise.allSettled([p1, p2]);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      /BACKUP_ALREADY_IN_PROGRESS/i,
    );
  });

  // 10. Prunes expired backup metadata and deletes physical file from storage driver
  it('prunes expired backup metadata and deletes physical file from storage driver', async () => {
    // Create an expired backup record and file
    const result = await backupService.triggerManualBackup('usr-sa', testKey);
    const fileExistsBefore = await fs
      .stat(result.backupLog.storageLocation)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsBefore).toBe(true);

    // Make it expired in DB
    await BackupLogModel.updateOne(
      { id: result.backupLog.id },
      { $set: { retentionExpiresAt: new Date(Date.now() - 1000) } },
    );

    const pruneResult = await backupService.pruneExpiredBackups();
    expect(pruneResult.prunedCount).toBe(1);

    // Verify physical file was deleted
    const fileExistsAfter = await fs
      .stat(result.backupLog.storageLocation)
      .then(() => true)
      .catch(() => false);
    expect(fileExistsAfter).toBe(false);

    // Verify status updated to PRUNED
    const updated = await BackupLogModel.findOne({ id: result.backupLog.id }).lean();
    expect(updated?.status).toBe('PRUNED');
  });
});
