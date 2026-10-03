import { Router, type Request, type Response } from 'express';
import { createChamberSchema, updateChamberSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { hierarchyService } from '../modules/storage/hierarchy.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

// All storage hierarchy mutations and reads require authentication, a completed forced
// password change, and storage RBAC. Facility scoping is enforced per route by
// requireFacilityScope against the owning facility.
const chamberRouter = Router();

chamberRouter.use(authenticate);
chamberRouter.use(requirePasswordChanged);

chamberRouter.post(
  '/facilities/:facilityId/chambers',
  requirePermission('storage:manage'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createChamberSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const facilityId = getParamId(req.params.facilityId);
      const chamber = await hierarchyService.createChamber(facilityId, parseResult.data);
      res.status(201).json({ chamber });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Chamber creation failed');
    }
  },
);

chamberRouter.get(
  '/facilities/:facilityId/chambers',
  requirePermission('storage:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const facilityId = getParamId(req.params.facilityId);
      const chambers = await hierarchyService.listChambers(facilityId);
      res.status(200).json({ items: chambers, total: chambers.length });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list chambers');
    }
  },
);

chamberRouter.get(
  '/chambers/:chamberId',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForChamber(getParamId(req.params.chamberId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chamberId = getParamId(req.params.chamberId);
      const chamber = await hierarchyService.getChamberById(chamberId);
      if (!chamber) {
        res.status(404).json({ error: 'Chamber not found' });
        return;
      }
      res.status(200).json({ chamber });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get chamber');
    }
  },
);

chamberRouter.patch(
  '/chambers/:chamberId',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForChamber(getParamId(req.params.chamberId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateChamberSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const chamberId = getParamId(req.params.chamberId);
      const updated = await hierarchyService.updateChamber(chamberId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Chamber not found' });
        return;
      }
      res.status(200).json({ chamber: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chamber update failed';
      const status =
        message.includes('already exists') || message.includes('active') || message.includes('inactive')
          ? 409
          : 400;
      res.status(status).json({ error: message });
    }
  },
);

export { chamberRouter };
