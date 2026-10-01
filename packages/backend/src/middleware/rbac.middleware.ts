import type { NextFunction, Request, Response } from 'express';
import { can, type PermissionKey } from '@cold-storage/contracts';
import { auditService } from '../modules/audit/audit.service.js';

/**
 * RBAC permission guard consuming the machine-readable permissions SSOT from @cold-storage/contracts.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!can(req.user.role, permission)) {
      void auditService.log({
        eventType: 'ACCESS_DENIED',
        severity: 'SECURITY',
        userId: req.user.userId,
        username: req.user.username,
        userRole: req.user.role,
        facilityId: null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        resource: 'rbac',
        resourceId: permission,
        details: {
          path: req.originalUrl || req.path,
          method: req.method,
          requiredPermission: permission,
        },
      });

      res.status(403).json({
        error: `Access denied: Role '${req.user.role}' lacks permission '${permission}'`,
      });
      return;
    }

    next();
  };
}
