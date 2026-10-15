import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { backupQuerySchema, backupRestoreSchema, backupTriggerSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { mutationsRateLimiter } from '../middleware/rate-limiter.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { inspectBackup, readBackupArchive, restoreBackup } from '../modules/backup/backup-restore.service.js';
import { backupService } from '../modules/backup/backup.service.js';
import { sendInternalError } from '../utils/http-error.js';

export const backupRouter = asyncRouter();

/**
 * POST /backups/trigger
 * Triggers a manual encrypted backup. Strictly restricted to SUPER_ADMIN.
 * Enforces single-execution mutex (returns 409 Conflict if already running).
 */
backupRouter.post(
  '/backups/trigger',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  mutationsRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = backupTriggerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await backupService.triggerManualBackup(req.user!.userId);
      res.status(201).json({
        message: 'Backup completed successfully',
        backupLog: result.backupLog,
        filename: result.filename,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Backup execution failed';
      if (message.includes('BACKUP_ALREADY_IN_PROGRESS')) {
        res.status(409).json({ error: 'Backup is already in progress' });
        return;
      }
      // Configuration refusals are reported as 503 so a client can distinguish "not set up yet"
      // from a genuine server fault, which previously surfaced as an opaque 500.
      if (message.includes('BACKUP_DISABLED')) {
        res.status(503).json({
          error: 'Encrypted backup is disabled in system settings',
          code: 'BACKUP_DISABLED',
        });
        return;
      }
      if (message.includes('BACKUP_KEY_INVALID')) {
        res.status(503).json({
          error:
            'BACKUP_ENCRYPTION_KEY is not configured on the server; it must be a 64-character hexadecimal string',
          code: 'BACKUP_KEY_INVALID',
        });
        return;
      }
      sendInternalError(res, err, 'Backup operation failed');
    }
  },
);

/**
 * GET /backups
 * Returns paginated backup logs. Strictly restricted to SUPER_ADMIN.
 */
backupRouter.get(
  '/backups',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = backupQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await backupService.queryBackupHistory(parseResult.data);
      res.status(200).json(result);
    } catch (err: unknown) {
            sendInternalError(res, err, 'Failed to load backup history');
    }
  },
);

/**
 * GET /backups/status
 * Returns system backup status projection (Atlas config projection + Application encrypted backup metrics).
 * Strictly restricted to SUPER_ADMIN.
 */
backupRouter.get(
  '/backups/status',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await backupService.getBackupStatus();
      res.status(200).json(status);
    } catch (err: unknown) {
            sendInternalError(res, err, 'Failed to load backup status');
    }
  },
);

/**
 * GET /backups/:id/download — secure archive download (SUPER_ADMIN only).
 * Checksum-verified before serving; audit-logged by the service on restore paths.
 */
backupRouter.get(
  '/backups/:id/download',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const backupId = req.params['id'] as string;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(backupId)) {
        res.status(400).json({ error: 'Invalid backup ID format' });
        return;
      }
      const { buffer } = await readBackupArchive(backupId);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(backupId)}.enc"`);
      res.status(200).send(buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed';
      const status = message.includes('BACKUP_NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  },
);

/**
 * GET /backups/:id/inspect — decrypted metadata + entity counts only (SUPER_ADMIN only).
 * Never returns raw documents.
 */
backupRouter.get(
  '/backups/:id/inspect',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const backupId = req.params['id'] as string;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(backupId)) {
        res.status(400).json({ error: 'Invalid backup ID format' });
        return;
      }
      const result = await inspectBackup(backupId);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Inspect failed';
      const status = message.includes('BACKUP_NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  },
);

/**
 * POST /backups/restore — full restore with safeguards (SUPER_ADMIN only).
 * Body: { backupId, confirm (=backupId), dryRun=true, targetDatabase? }.
 * Take a fresh backup before any non-dry-run restore. Live cold_storage
 * writes require BACKUP_ALLOW_LIVE_RESTORE=true.
 */
backupRouter.post(
  '/backups/restore',
  authenticate,
  requirePasswordChanged,
  requirePermission('backup:manage'),
  mutationsRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = backupRestoreSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    try {
      const result = await restoreBackup(req.user!.userId, parseResult.data);
      res.status(200).json({ message: result.dryRun ? 'Restore dry-run complete' : 'Restore complete', result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      let status = 500;
      if (message.includes('BACKUP_NOT_FOUND')) status = 404;
      else if (message.includes('RESTORE_CONFIRM_MISMATCH')) status = 400;
      else if (message.includes('RESTORE_LIVE_BLOCKED') || message.includes('RESTORE_TARGET_MISMATCH')) status = 403;
      res.status(status).json({ error: message });
    }
  },
);
