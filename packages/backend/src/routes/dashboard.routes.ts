import { Router, type Request, type Response } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { getParamId } from '../utils/params.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
dashboardRouter.use(requirePasswordChanged);

/**
 * GET /facilities/:facilityId/dashboard/summary
 *
 * Authorization chain (P2 canonical — identical to all other facility-scoped routes):
 *   authenticate → requirePasswordChanged → requirePermission('dashboard:view')
 *   → requireFacilityScope → DashboardService
 *
 * The :facilityId URL parameter is validated against req.user.facilityIds by
 * requireFacilityScope and is NOT treated as authorization by itself.
 * Database facilityId filtering inside DashboardService is additional defense in depth.
 */
dashboardRouter.get(
  '/facilities/:facilityId/dashboard/summary',
  requirePermission('dashboard:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    try {
      const summary = await dashboardService.getSummary(facilityId);
      res.status(200).json({ summary });
    } catch (err: unknown) {
      // Reuse repository error-handling convention: expose err.message for known
      // operational errors; log internally but do not expose database details.
      const message =
        err instanceof Error ? err.message : 'Failed to retrieve dashboard summary';
      res.status(500).json({ error: message });
    }
  },
);
