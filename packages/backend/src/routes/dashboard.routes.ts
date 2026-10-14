import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getParamId } from '../utils/params.js';
import { sendInternalError } from '../utils/http-error.js';

export const dashboardRouter = asyncRouter();

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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    try {
      const summary = await dashboardService.getSummary(facilityId);
      res.status(200).json({ summary });
    } catch (err: unknown) {
      // Internal detail is logged with a correlation id; only a fixed message
      // reaches the client, so database names and index names never leak.
      sendInternalError(res, err, 'Failed to load dashboard summary');
    }
  }),
);
