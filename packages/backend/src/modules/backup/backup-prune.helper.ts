import { BackupLogModel } from '../../database/models/backup-log.model.js';
import type { BackupStorageDriver } from './storage/storage.driver.js';

/** Retention enforcement: delete expired COMPLETED archives, mark PRUNED. */
export async function pruneExpiredBackups(
  storageDriver: BackupStorageDriver,
): Promise<{ prunedCount: number; deletedLocations: string[] }> {
  const expiredLogs = await BackupLogModel.find({
    retentionExpiresAt: { $lt: new Date() },
    status: 'COMPLETED',
  }).exec();
  const deletedLocations: string[] = [];
  for (const log of expiredLogs) {
    await storageDriver.delete(log.storageLocation);
    deletedLocations.push(log.storageLocation);
    log.status = 'PRUNED';
    await log.save();
  }
  return { prunedCount: expiredLogs.length, deletedLocations };
}
