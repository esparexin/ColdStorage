import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { getScheduleConfig, getScheduleStatus, startBackupScheduler, stopBackupScheduler } from '../modules/backup/backup.scheduler.js';

describe('BKP-01 backup scheduler config', () => {
  afterEach(() => {
    stopBackupScheduler();
    config.backupScheduleEnabled = false;
  });

  it('disabled by default', () => {
    config.backupScheduleEnabled = false;
    expect(getScheduleConfig().enabled).toBe(false);
    expect(startBackupScheduler()).toBe(false);
  });

  it('enforces minimum 60s interval', () => {
    config.backupScheduleEnabled = true;
    config.backupScheduleIntervalMs = 1000;
    expect(getScheduleConfig().intervalMs).toBe(60000);
  });

  it('starts and stops when enabled', () => {
    config.backupScheduleEnabled = true;
    config.backupScheduleIntervalMs = 60000;
    expect(startBackupScheduler()).toBe(true);
    const status = getScheduleStatus();
    expect(status.enabled).toBe(true);
    expect(status.intervalMs).toBe(60000);
    stopBackupScheduler();
  });
});
