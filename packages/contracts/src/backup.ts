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

export type BackupTriggerInput = z.infer<typeof backupTriggerSchema>;

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
 * System backup status projection schema (Decision 7).
 */
export const backupStatusResponseSchema = z.object({
  atlasManagedBackup: z.object({
    provider: z.literal('MongoDB Atlas'),
    retentionDays: z.number().int().min(1),
    mode: z.literal('PLATFORM_MANAGED'),
    status: z.literal('CONFIGURED'),
  }),
  applicationEncryptedBackup: z.object({
    enabled: z.boolean(),
    retentionDays: z.number().int().min(1),
    lastBackupAt: z.coerce.date().nullable(),
    lastBackupStatus: backupStatusSchema.nullable(),
    totalCompletedBackups: z.number().int().min(0),
  }),
});

export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
