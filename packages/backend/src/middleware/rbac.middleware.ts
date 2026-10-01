import type { NextFunction, Request, Response } from 'express';
import { can, type PermissionKey } from '@cold-storage/contracts';

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
      res.status(403).json({
        error: `Access denied: Role '${req.user.role}' lacks permission '${permission}'`,
      });
      return;
    }

    next();
  };
}
