import { randomBytes } from 'node:crypto';
import type { BackupLogRecord, BackupQuery, BackupStatusResponse } from '@cold-storage/contracts';
import { BackupLogModel, type BackupLogDoc } from '../../database/models/backup-log.model.js';
import { auditService } from '../audit/audit.service.js';
import { settingsService } from '../settings/settings.service.js';
import { collectBackupEntities } from './backup-collector.js';
import {
  decryptBackupArchive,
  encryptBackupPayload,
  getValidEncryptionKey,
  isEncryptionKeyConfigured,
} from './backup-crypto.js';
import { getBackupStatus, queryBackupHistory } from './backup-queries.js';
import { BackupStorageDriver, LocalEncryptedStorageDriver } from './storage/storage.driver.js';

export class BackupService {
  private isBackupInProgress = false;
  private storageDriver: BackupStorageDriver;

  constructor(storageDriver?: BackupStorageDriver) {
    this.storageDriver = storageDriver ?? new LocalEncryptedStorageDriver();
  }

  public setStorageDriver(driver: BackupStorageDriver): void {
    this.storageDriver = driver;
  }

  public decryptBackupArchive(archiveBuffer: Buffer, keyHex: string): Record<string, unknown> {
    return decryptBackupArchive(archiveBuffer, keyHex);
  }

  /**
   * Executes manual application-level encrypted backup (AES-256-GCM).
   */
  public async triggerManualBackup(
    userId: string,
    overrideKey?: string,
  ): Promise<{ backupLog: BackupLogRecord; filename: string }> {
    if (this.isBackupInProgress) {
      throw new Error('BACKUP_ALREADY_IN_PROGRESS: A backup operation is currently executing');
    }

    // The concurrency guard is claimed synchronously, before the first await, so two concurrent
    // triggers cannot both pass the check.
    this.isBackupInProgress = true;

    // Configuration is validated before the run is registered. A backup that is switched off or
    // missing its encryption key is a configuration state, not a failed run, so it must not
    // create a FAILED log row or raise a CRITICAL audit event. `runRegistered` records whether a
    // log row exists for this attempt, which is what decides if the catch block writes one.
    let runRegistered = false;
    let retentionDays = 30;
    const backupId = `backup_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const filename = `${backupId}.enc`;

    try {
      const { settings } = await settingsService.getSettings();
      if (!settings.backupPolicy.backupEnabled) {
        throw new Error('BACKUP_DISABLED: Encrypted backup is disabled in system settings');
      }
      if (!isEncryptionKeyConfigured(overrideKey)) {
        throw new Error(
          'BACKUP_KEY_INVALID: BACKUP_ENCRYPTION_KEY must be a 64-character hexadecimal string',
        );
      }
      retentionDays = settings.backupPolicy.retentionDays ?? 30;

      const keyBuffer = getValidEncryptionKey(overrideKey);
      const retentionExpiresAt = new Date(Date.now() + retentionDays * 86400 * 1000);

      await BackupLogModel.create({
        id: backupId,
        backupType: 'MANUAL',
        status: 'IN_PROGRESS',
        sizeBytes: 0,
        checksum: null,
        storageLocation: filename,
        retentionExpiresAt,
        triggeredBy: userId,
        errorMessage: null,
      });
      runRegistered = true;

      const entities = await collectBackupEntities();
      const payload = {
        metadata: {
          format: 'COLD_STORAGE_BACKUP',
          version: '1.0',
          createdAt: new Date().toISOString(),
          appVersion: '0.1.0',
        },
        entities,
      };

      const plainTextBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
      const { finalArchive, checksum } = encryptBackupPayload(plainTextBuffer, keyBuffer);

      const writeResult = await this.storageDriver.write(filename, finalArchive);

      const verified = await this.storageDriver.verify(
        writeResult.location,
        finalArchive.byteLength,
      );
      if (!verified) {
        throw new Error(
          'BACKUP_VERIFICATION_FAILED: Written backup size does not match generated archive',
        );
      }

      const updatedLog = await BackupLogModel.findOneAndUpdate(
        { id: backupId },
        {
          $set: {
            status: 'COMPLETED',
            sizeBytes: writeResult.sizeBytes,
            checksum,
            storageLocation: writeResult.location,
          },
        },
        { new: true },
      )
        .lean()
        .exec();

      await auditService.log({
        eventType: 'BACKUP_TRIGGERED',
        severity: 'INFO',
        userId,
        resource: 'backup',
        resourceId: backupId,
        details: { sizeBytes: writeResult.sizeBytes, checksum },
      });

      return {
        backupLog: {
          id: updatedLog!.id,
          backupType: updatedLog!.backupType,
          status: updatedLog!.status,
          sizeBytes: updatedLog!.sizeBytes,
          checksum: updatedLog!.checksum,
          storageLocation: updatedLog!.storageLocation,
          retentionExpiresAt: updatedLog!.retentionExpiresAt,
          triggeredBy: updatedLog!.triggeredBy,
          errorMessage: updatedLog!.errorMessage,
          createdAt: updatedLog!.createdAt,
          updatedAt: updatedLog!.updatedAt,
        },
        filename,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // Only a run that was actually registered can be marked FAILED. A configuration refusal
      // happens before any row exists, so it must not manufacture one or escalate the audit
      // severity for what is an expected, operator-visible state.
      if (runRegistered) {
        await BackupLogModel.findOneAndUpdate(
          { id: backupId },
          {
            $set: {
              status: 'FAILED',
              errorMessage: message,
            },
          },
        ).exec();

        await auditService.log({
          eventType: 'BACKUP_TRIGGERED',
          severity: 'CRITICAL',
          userId,
          resource: 'backup',
          resourceId: backupId,
          details: { error: message },
        });
      } else {
        await auditService.log({
          eventType: 'BACKUP_TRIGGERED',
          severity: 'INFO',
          userId,
          resource: 'backup',
          resourceId: null,
          details: { refused: message },
        });
      }

      throw err;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Prunes expired backups based on retention policy, physically deleting objects from storage.
   */
  public async pruneExpiredBackups(): Promise<{ prunedCount: number; deletedLocations: string[] }> {
    const now = new Date();
    const expiredLogs = await BackupLogModel.find({
      retentionExpiresAt: { $lt: now },
      status: 'COMPLETED',
    }).exec();

    const deletedLocations: string[] = [];

    for (const log of expiredLogs) {
      await this.storageDriver.delete(log.storageLocation);
      deletedLocations.push(log.storageLocation);

      log.status = 'PRUNED';
      await log.save();
    }

    return {
      prunedCount: expiredLogs.length,
      deletedLocations,
    };
  }

  /**
   * Queries paginated backup history.
   */
  public async queryBackupHistory(
    queryOrStatus?: BackupQuery | string,
    pageArg = 1,
    limitArg = 20,
  ): Promise<{ items: BackupLogDoc[]; total: number; page: number; limit: number }> {
    return queryBackupHistory(queryOrStatus, pageArg, limitArg);
  }

  /**
   * Returns authoritative backup status projection (Decision 7).
   */
  public async getBackupStatus(): Promise<BackupStatusResponse> {
    return getBackupStatus();
  }
}

export const backupService = new BackupService();
