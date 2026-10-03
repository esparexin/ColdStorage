import { z } from 'zod';

/**
 * System Settings Singleton Schema (P0-Rule 7 & Architecture Lock).
 * Centralized configuration for organizational details, document templates and backup policy.
 * Document templates must dynamically bind to this singleton; no hard-coding.
 *
 * Document number formats are deliberately absent. Numbering is owned by
 * `modules/common/counter.service.ts`, which allocates financial-year sequences with hardcoded
 * family prefixes. Those prefixes were mirrored here as editable fields but never read by the
 * generator, so exposing them in Settings only implied a configurability that did not exist.
 */
export const systemSettingsSchema = z.object({
  orgName: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(500),
  contact: z.string().trim().min(1).max(200),
  gstin: z.string().trim().max(15).nullish(),
  logoAssetId: z.string().trim().max(128).nullish(),
  printFooter: z.string().trim().max(500).default(''),
  timezone: z.string().default('Asia/Kolkata'),
  backupPolicy: z
    .object({
      retentionDays: z.number().int().default(30),
      backupEnabled: z.boolean().default(true),
    })
    .default({}),
});

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
