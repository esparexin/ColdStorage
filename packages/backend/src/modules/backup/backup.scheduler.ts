import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { backupService } from './backup.service.js';

/**
 * Explicitly configured backup schedule (BKP-01).
 *
 * Disabled unless BACKUP_SCHEDULE_ENABLED=true. Interval from
 * BACKUP_SCHEDULE_INTERVAL_MS (min 60s, default 24h). Uses setInterval
 * so no new vendor dependency is required; Atlas snapshots remain the
 * platform layer and are monitored separately (see runbook).
 */
const MIN_INTERVAL_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastScheduledAt: Date | null = null;
let lastScheduledStatus: string | null = null;

export function getScheduleConfig(): { enabled: boolean; intervalMs: number } {
  const intervalMs = Math.max(config.backupScheduleIntervalMs ?? 24 * 60 * 60 * 1000, MIN_INTERVAL_MS);
  return { enabled: config.backupScheduleEnabled === true, intervalMs };
}

export function getScheduleStatus(): {
  enabled: boolean;
  intervalMs: number;
  lastScheduledAt: Date | null;
  lastScheduledStatus: string | null;
} {
  const { enabled, intervalMs } = getScheduleConfig();
  return { enabled, intervalMs, lastScheduledAt, lastScheduledStatus };
}

async function runScheduledBackup(): Promise<void> {
  lastScheduledAt = new Date();
  try {
    await backupService.triggerManualBackup('system:scheduler', undefined, 'SCHEDULED');
    lastScheduledStatus = 'COMPLETED';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('BACKUP_ALREADY_IN_PROGRESS')) {
      lastScheduledStatus = 'SKIPPED_IN_PROGRESS';
      return;
    }
    lastScheduledStatus = `FAILED: ${message}`;
    logger.warn('Scheduled backup failed', { error: message });
  }
}

export function startBackupScheduler(): boolean {
  const { enabled, intervalMs } = getScheduleConfig();
  if (!enabled || timer) return false;
  timer = setInterval(() => {
    void runScheduledBackup();
  }, intervalMs);
  timer.unref?.();
  logger.info('Backup scheduler started', { intervalMs });
  return true;
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
