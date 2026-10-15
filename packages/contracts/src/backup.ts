import { z } from 'zod';

export const backupTypeSchema = z.enum(['MANUAL', 'SCHEDULED']);
export type BackupType = z.infer<typeof backupTypeSchema>;

export const backupStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'FAILED', 'PRUNED']);
export type BackupStatus = z.infer<typeof backupStatusSchema>;

/**
 * Schema for triggering a manual backup.
 */
export const backupTriggerSchema = z.object({
  backupType: backupTypeSchema.default('MANUAL'),
});

/**
 * Backup log entry DTO schema.
 */
export const backupLogRecordSchema = z.object({
  id: z.string(),
  backupType: backupTypeSchema,
  status: backupStatusSchema,
  sizeBytes: z.number().int().min(0),
  checksum: z.string().nullable().optional(),
  storageLocation: z.string(),
  retentionExpiresAt: z.coerce.date(),
  triggeredBy: z.string(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type BackupLogRecord = z.infer<typeof backupLogRecordSchema>;

/**
 * Backup history query schema.
 */
export const backupQuerySchema = z.object({
  status: backupStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type BackupQuery = z.infer<typeof backupQuerySchema>;

/**
 * Backup status projection.
 *
 * Every field reports observed state. `configured` is the single gate the service enforces,
 * and the UI disables backup actions while it is false. `schedule` and `offsite` are
 * additive, optional projections: older clients ignore them.
 */
export const backupScheduleStatusSchema = z.object({
  enabled: z.boolean(),
  intervalMs: z.number().int().min(60000),
  lastScheduledAt: z.coerce.date().nullable(),
  lastScheduledStatus: z.string().nullable(),
});

export const backupOffsiteStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.string().nullable(),
  lastUploadedAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
});

export const backupStatusResponseSchema = z.object({
  encryptedArchive: z.object({
    /** True when the operator has enabled encrypted backups in system settings. */
    enabled: z.boolean(),
    /** True only when a 64-hex BACKUP_ENCRYPTION_KEY is available to the backend process. */
    keyConfigured: z.boolean(),
    /** True when both the settings gate and the encryption key are present. */
    configured: z.boolean(),
    retentionDays: z.number().int().min(1),
    /** ISO timestamp of the most recent completed run, or null when none has completed. */
    lastBackupAt: z.coerce.date().nullable(),
    totalCompletedBackups: z.number().int().min(0),
  }),
  schedule: backupScheduleStatusSchema.optional(),
  offsite: backupOffsiteStatusSchema.optional(),
});

export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
export type BackupScheduleStatus = z.infer<typeof backupScheduleStatusSchema>;
export type BackupOffsiteStatus = z.infer<typeof backupOffsiteStatusSchema>;

/** Secure inspection result: entity counts only, never raw documents. */
export const backupInspectResponseSchema = z.object({
  id: z.string(),
  format: z.string(),
  version: z.string(),
  createdAt: z.string(),
  checksumMatch: z.boolean(),
  entityCounts: z.record(z.string(), z.number().int().min(0)),
});

export type BackupInspectResponse = z.infer<typeof backupInspectResponseSchema>;

/** Restore request. `confirm` must equal the backup id; live targets need extra env guard. */
export const backupRestoreSchema = z.object({
  backupId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Invalid backup ID format'),
  confirm: z.string().min(1),
  dryRun: z.boolean().default(true),
  targetDatabase: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid target database').optional(),
});

export type BackupRestoreInput = z.infer<typeof backupRestoreSchema>;
