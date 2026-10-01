import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { BackupLogRecord, BackupQuery, BackupStatusResponse } from '@cold-storage/contracts';
import { BackupLogModel, type BackupLogDoc } from '../../database/models/backup-log.model.js';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { LevelModel } from '../../database/models/level.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { PutAwayAllocationModel } from '../../database/models/put-away.model.js';
import { RackModel } from '../../database/models/rack.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { UserModel } from '../../database/models/user.model.js';
import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { auditService } from '../audit/audit.service.js';
import { settingsService } from '../settings/settings.service.js';
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

  /**
   * Validates that BACKUP_ENCRYPTION_KEY is configured and formatted as exactly 64 hex chars (32 bytes).
   */
  private getValidEncryptionKey(overrideKey?: string): Buffer {
    const rawKey = overrideKey ?? process.env.BACKUP_ENCRYPTION_KEY ?? '';
    const trimmed = rawKey.trim();

    if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      throw new Error(
        'BACKUP_KEY_INVALID: BACKUP_ENCRYPTION_KEY environment variable must be a 64-character hexadecimal string',
      );
    }

    return Buffer.from(trimmed, 'hex');
  }

  /**
   * Collects all business entities in dependency order.
   * Ephemeral session records and active JWT access tokens are strictly excluded.
   */
  public async collectBackupEntities(): Promise<Record<string, unknown>> {
    const [
      systemSettings,
      users,
      facilities,
      chambers,
      racks,
      levels,
      positions,
      customers,
      commodities,
      grns,
      putAways,
      inventoryTransactions,
      deliveryChallans,
      deliveryReversals,
      counters,
      auditLogs,
    ] = await Promise.all([
      SystemSettingsModel.find().lean().exec(),
      UserModel.find().lean().exec(),
      FacilityModel.find().lean().exec(),
      ChamberModel.find().lean().exec(),
      RackModel.find().lean().exec(),
      LevelModel.find().lean().exec(),
      PositionModel.find().lean().exec(),
      CustomerModel.find().lean().exec(),
      CommodityModel.find().lean().exec(),
      GrnModel.find().lean().exec(),
      PutAwayAllocationModel.find().lean().exec(),
      InventoryTransactionModel.find().lean().exec(),
      DeliveryChallanModel.find().lean().exec(),
      DeliveryReversalModel.find().lean().exec(),
      CounterModel.find().lean().exec(),
      AuditLogModel.find().lean().exec(),
    ]);

    return {
      systemSettings,
      users,
      facilities,
      chambers,
      racks,
      levels,
      positions,
      customers,
      commodities,
      grns,
      putAways,
      inventoryTransactions,
      deliveryChallans,
      deliveryReversals,
      counters,
      auditLogs,
    };
  }

  /**
   * Executes manual application-level encrypted backup (AES-256-GCM).
   */
  public async triggerManualBackup(
    userId: string,
    overrideKey?: string,
  ): Promise<{ backupLog: BackupLogRecord; filename: string }> {
    // 1. Concurrency Mutex
    if (this.isBackupInProgress) {
      throw new Error('BACKUP_ALREADY_IN_PROGRESS: A backup operation is currently executing');
    }

    this.isBackupInProgress = true;
    const backupId = `backup_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const filename = `${backupId}.enc`;

    try {
      // 2. Validate policy & encryption key
      const { settings } = await settingsService.getSettings();
      if (!settings.backupPolicy.driveBackupEnabled) {
        throw new Error(
          'BACKUP_DISABLED: Application-level encrypted backup is disabled in system settings',
        );
      }

      const keyBuffer = this.getValidEncryptionKey(overrideKey);
      const retentionDays = settings.backupPolicy.driveRetentionDays ?? 30;
      const retentionExpiresAt = new Date(Date.now() + retentionDays * 86400 * 1000);

      // Record initial IN_PROGRESS state
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

      // 3. Collect domain data
      const entities = await this.collectBackupEntities();
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

      // 4. AES-256-GCM Encryption
      const iv = randomBytes(12); // 96-bit IV
      const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);

      const encryptedData = Buffer.concat([cipher.update(plainTextBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag(); // 128-bit authentication tag

      // File structure: [IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
      const finalArchive = Buffer.concat([iv, authTag, encryptedData]);

      // 5. Checksum calculation
      const checksum = createHash('sha256').update(finalArchive).digest('hex');

      // 6. Write through storage driver
      const writeResult = await this.storageDriver.write(filename, finalArchive);

      // 7. Verify written archive
      const verified = await this.storageDriver.verify(
        writeResult.location,
        finalArchive.byteLength,
      );
      if (!verified) {
        throw new Error(
          'BACKUP_VERIFICATION_FAILED: Written backup size does not match generated archive',
        );
      }

      // 8. Update log to COMPLETED
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

      // Emit audit event
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

      // Record FAILED state in log (upsert if failed before initial insert)
      await BackupLogModel.findOneAndUpdate(
        { id: backupId },
        {
          $set: {
            status: 'FAILED',
            errorMessage: message,
          },
          $setOnInsert: {
            backupType: 'MANUAL',
            sizeBytes: 0,
            storageLocation: filename,
            retentionExpiresAt: new Date(),
            triggeredBy: userId,
          },
        },
        { upsert: true },
      ).exec();

      await auditService.log({
        eventType: 'BACKUP_TRIGGERED',
        severity: 'CRITICAL',
        userId,
        resource: 'backup',
        resourceId: backupId,
        details: { error: message },
      });

      throw err;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Decrypts and verifies a generated backup archive (for testing and restoration).
   */
  public decryptBackupArchive(archiveBuffer: Buffer, keyHex: string): Record<string, unknown> {
    const key = Buffer.from(keyHex.trim(), 'hex');
    if (key.length !== 32) {
      throw new Error('BACKUP_KEY_INVALID: Master decryption key must be 32 bytes');
    }

    if (archiveBuffer.length < 28) {
      throw new Error('ARCHIVE_CORRUPTED: Buffer too small to contain IV and AuthTag');
    }

    const iv = archiveBuffer.subarray(0, 12);
    const authTag = archiveBuffer.subarray(12, 28);
    const ciphertext = archiveBuffer.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
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
      // Physically delete object from storage driver
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
    let status: string | undefined;
    let page = pageArg;
    let limit = limitArg;

    if (queryOrStatus && typeof queryOrStatus === 'object') {
      status = queryOrStatus.status;
      page = queryOrStatus.page ?? 1;
      limit = queryOrStatus.limit ?? 20;
    } else if (typeof queryOrStatus === 'string') {
      status = queryOrStatus;
    }

    const filter: Record<string, unknown> = {};
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      BackupLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      BackupLogModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as BackupLogDoc[],
      total,
      page,
      limit,
    };
  }

  /**
   * Returns authoritative backup status projection (Decision 7).
   */
  public async getBackupStatus(): Promise<BackupStatusResponse> {
    const { settings } = await settingsService.getSettings();
    const latestCompleted = await BackupLogModel.findOne({ status: 'COMPLETED' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const totalCompleted = await BackupLogModel.countDocuments({ status: 'COMPLETED' }).exec();

    return {
      atlasManagedBackup: {
        provider: 'MongoDB Atlas',
        retentionDays: settings.backupPolicy.atlasRetentionDays ?? 7,
        mode: 'PLATFORM_MANAGED',
        status: 'CONFIGURED',
      },
      applicationEncryptedBackup: {
        enabled: settings.backupPolicy.driveBackupEnabled ?? true,
        retentionDays: settings.backupPolicy.driveRetentionDays ?? 30,
        lastBackupAt: latestCompleted?.createdAt ?? null,
        lastBackupStatus: (latestCompleted?.status as 'COMPLETED') ?? null,
        totalCompletedBackups: totalCompleted,
      },
    };
  }
}

export const backupService = new BackupService();
