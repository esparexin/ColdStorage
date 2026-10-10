import type { NextFunction, Request, Response } from 'express';
import { inFacilityScope } from '@cold-storage/contracts';
import { auditService } from '../modules/audit/audit.service.js';

type FacilityIdExtractor = (
  req: Request,
) => string | string[] | undefined | null | Promise<string | string[] | undefined | null>;

/**
 * Facility-scoped authorization middleware consuming the SSOT from @cold-storage/contracts.
 * - System Super Admin (or any role flagged `hasGlobalFacilityScope`) has global scope.
 * - Other roles must be explicitly assigned to the target facility ID.
 * Scope resolves from DB-authoritative `gateState` when present so role changes apply immediately.
 */
export function requireFacilityScope(extractor: FacilityIdExtractor) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    let raw: string | string[] | undefined | null;
    try {
      raw = await extractor(req);
    } catch {
      res.status(500).json({ error: 'Authorization check failed' });
      return;
    }
    const targetFacilityId = Array.isArray(raw) ? raw[0] : raw;
    if (!targetFacilityId) {
      res.status(404).json({ error: 'Target facility or parent entity not found' });
      return;
    }

    const gateFacilityIds = req.gateState?.facilityIds ?? req.user.facilityIds;
    const hasGlobal = req.gateState?.hasGlobalScope;
    let permitted: boolean;
    if (hasGlobal !== undefined) {
      permitted = hasGlobal ? true : gateFacilityIds.includes(targetFacilityId);
    } else {
      permitted = inFacilityScope(req.user.role, gateFacilityIds, targetFacilityId);
    }
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
