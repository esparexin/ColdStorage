import { Router, type Request, type Response } from 'express';
import { backupQuerySchema, backupTriggerSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { mutationsRateLimiter } from '../middleware/rate-limiter.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { backupService } from '../modules/backup/backup.service.js';

export const backupRouter = Router();

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
      res.status(500).json({ error: message });
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

    const result = await backupService.queryBackupHistory(parseResult.data);
    res.status(200).json(result);
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
    const status = await backupService.getBackupStatus();
    res.status(200).json(status);
  },
);
