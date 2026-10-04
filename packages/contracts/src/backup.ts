import { z } from 'zod';

export const backupTypeSchema = z.enum(['MANUAL']);
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
 * Every field reports observed state. There is no platform-managed backup integration and no
 * scheduled automation in this codebase, so no field claims either. `configured` is the single
 * gate the service enforces, and the UI disables backup actions while it is false.
 */
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
});

export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
