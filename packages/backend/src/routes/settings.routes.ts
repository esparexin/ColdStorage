import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { systemSettingsSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { settingsService } from '../modules/settings/settings.service.js';
import { sendInternalError } from '../utils/http-error.js';

export const settingsRouter = asyncRouter();

settingsRouter.use(authenticate);
settingsRouter.use(requirePasswordChanged);

/**
 * GET /api/settings — OWNERSHIP: settingsRouter owns settings JSON; assetRouter owns logo bytes.
 * Same /api/settings* namespace by design (non-breaking); see asset.routes.ts.
 * Authenticated users can retrieve current system settings and configuration state.
 */
settingsRouter.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await settingsService.getSettings();
    res.status(200).json(result);
  } catch (err: unknown) {
        sendInternalError(res, err, 'Failed to retrieve system settings');
  }
});

/**
 * PUT /api/settings
 * Restricted to SUPER_ADMIN ('settings:manage' permission).
 * Updates system settings singleton after validating with systemSettingsSchema.
 */
settingsRouter.put(
  '/settings',
  requirePermission('settings:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = systemSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await settingsService.updateSettings(parseResult.data, req.user!.userId);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update system settings';
      res.status(400).json({ error: message });
    }
  },
);
