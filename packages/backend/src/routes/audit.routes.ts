import { Router, type Request, type Response } from 'express';
import { auditQuerySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { auditService } from '../modules/audit/audit.service.js';
import { getParamId } from '../utils/params.js';

export const auditRouter = Router();

/**
 * GET /audit-logs
 * Retrieves paginated audit logs with facility-level scoping.
 * - SUPER_ADMIN: Can query across all facilities and global events.
 * - ADMIN: Restrained to assigned facilities. Rejects unassigned facility queries with 403.
 * - OPERATOR, READ_ONLY: Rejected with 403 (lacks audit:view).
 */
auditRouter.get(
  '/audit-logs',
  authenticate,
  requirePasswordChanged,
  requirePermission('audit:view'),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = auditQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    const query = parseResult.data;
    const user = req.user!;

    // Enforce facility scoping for non-SUPER_ADMIN users
    if (user.role !== 'SUPER_ADMIN') {
      if (query.facilityId && !user.facilityIds.includes(query.facilityId)) {
        res.status(403).json({
          error: `Access denied: User is not authorized to access facility '${query.facilityId}'`,
        });
        return;
      }
    }

    const authorizedFacilityIds = user.role === 'SUPER_ADMIN' ? null : user.facilityIds;
    const result = await auditService.queryLogs(query, authorizedFacilityIds);
    res.status(200).json(result);
  },
);

/**
 * GET /audit-logs/:id
 * Retrieves a single audit log entry by ID with facility-level scoping.
 */
auditRouter.get(
  '/audit-logs/:id',
  authenticate,
  requirePasswordChanged,
  requirePermission('audit:view'),
  async (req: Request, res: Response): Promise<void> => {
    const id = getParamId(req.params.id);
    const user = req.user!;
    const authorizedFacilityIds = user.role === 'SUPER_ADMIN' ? null : user.facilityIds;

    try {
      const log = await auditService.getLogById(id, authorizedFacilityIds);
      if (!log) {
        res.status(404).json({ error: 'Audit log not found' });
        return;
      }
      res.status(200).json(log);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Access denied';
      if (message.includes('ACCESS_DENIED')) {
        res.status(403).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);
