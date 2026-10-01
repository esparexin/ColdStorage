import { z } from 'zod';
import { documentNumberingModeSchema } from './identifiers.js';

/**
 * System Settings Singleton Schema (P0-Rule 7 & Architecture Lock).
 * Centralized configuration for organizational details, document formats, and backup policies.
 * Document templates must dynamically bind to this singleton; no hard-coding.
 */
export const systemSettingsSchema = z.object({
  orgName: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(500),
  contact: z.string().trim().min(1).max(200),
  gstin: z.string().trim().max(15).nullish(),
  logoAssetId: z.string().trim().max(128).nullish(),
  printFooter: z.string().trim().max(500).default(''),
  timezone: z.string().default('Asia/Kolkata'),
  documentNumbering: z
    .object({
      mode: documentNumberingModeSchema.default('FY_SEQUENTIAL'),
      grnPrefix: z.string().default('GRN'),
      receiptPrefix: z.string().default('RCPT'),
      challanPrefix: z.string().default('CHL'),
      rentReceiptPrefix: z.string().default('RRCPT'),
    })
    .default({}),
  backupPolicy: z
    .object({
      atlasRetentionDays: z.number().int().default(7),
      driveRetentionDays: z.number().int().default(30),
      driveBackupEnabled: z.boolean().default(true),
    })
    .default({}),
});

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
