import type { NextFunction, Request, Response } from 'express';
import { inFacilityScope } from '@cold-storage/contracts';
import { auditService } from '../modules/audit/audit.service.js';

type FacilityIdExtractor = (
  req: Request,
) => string | string[] | undefined | null | Promise<string | string[] | undefined | null>;

/**
 * Facility-scoped authorization middleware consuming the SSOT from @cold-storage/contracts.
 * - SUPER_ADMIN has global facility scope.
 * - Other roles must be explicitly assigned to the target facility ID.
 */
export function requireFacilityScope(extractor: FacilityIdExtractor) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const raw = await extractor(req);
    const targetFacilityId = Array.isArray(raw) ? raw[0] : raw;
    if (!targetFacilityId) {
      res.status(404).json({ error: 'Target facility or parent entity not found' });
      return;
    }

    const permitted = inFacilityScope(req.user.role, req.user.facilityIds, targetFacilityId);
    if (!permitted) {
      void auditService.log({
        eventType: 'ACCESS_DENIED',
        severity: 'SECURITY',
        userId: req.user.userId,
        username: req.user.username,
        userRole: req.user.role,
        facilityId: targetFacilityId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        resource: 'facility',
        resourceId: targetFacilityId,
        details: {
          path: req.originalUrl || req.path,
          method: req.method,
          targetFacilityId,
          userFacilityIds: req.user.facilityIds,
        },
      });

      res.status(403).json({
        error: `Access denied: User is not authorized to access facility '${targetFacilityId}'`,
      });
      return;
    }

    next();
  };
}
