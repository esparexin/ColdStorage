import type { BackupQuery, BackupStatusResponse } from '@cold-storage/contracts';
import { BackupLogModel, type BackupLogDoc } from '../../database/models/backup-log.model.js';
import { settingsService } from '../settings/settings.service.js';
import { isEncryptionKeyConfigured } from './backup-crypto.js';

export async function queryBackupHistory(
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

export async function getBackupStatus(): Promise<BackupStatusResponse> {
  // The two backup-log reads are independent of each other and of the settings
  // read, so they no longer run as three sequential round trips.
  const [{ settings }, latestCompleted, totalCompleted] = await Promise.all([
    settingsService.getSettings(),
    BackupLogModel.findOne({ status: 'COMPLETED' }).sort({ createdAt: -1 }).lean().exec(),
    BackupLogModel.countDocuments({ status: 'COMPLETED' }).exec(),
  ]);

  const enabled = settings.backupPolicy.backupEnabled ?? true;
  const keyConfigured = isEncryptionKeyConfigured();

  return {
    encryptedArchive: {
      enabled,
      keyConfigured,
      configured: enabled && keyConfigured,
      retentionDays: settings.backupPolicy.retentionDays ?? 30,
      lastBackupAt: latestCompleted?.createdAt ?? null,
      totalCompletedBackups: totalCompleted,
    },
  };
}
