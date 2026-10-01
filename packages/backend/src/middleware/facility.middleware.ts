import type { NextFunction, Request, Response } from 'express';
import { inFacilityScope } from '@cold-storage/contracts';

type FacilityIdExtractor = (req: Request) => string | string[] | undefined;

/**
 * Facility-scoped authorization middleware consuming the SSOT from @cold-storage/contracts.
 * - SUPER_ADMIN has global facility scope.
 * - Other roles must be explicitly assigned to the target facility ID.
 */
export function requireFacilityScope(extractor: FacilityIdExtractor) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const raw = extractor(req);
    const targetFacilityId = Array.isArray(raw) ? raw[0] : raw;
    if (!targetFacilityId) {
      res.status(400).json({ error: 'Target facility ID could not be determined from request' });
      return;
    }

    const permitted = inFacilityScope(req.user.role, req.user.facilityIds, targetFacilityId);
    if (!permitted) {
      res.status(403).json({
        error: `Access denied: User is not authorized to access facility '${targetFacilityId}'`,
      });
      return;
    }

    next();
  };
}
