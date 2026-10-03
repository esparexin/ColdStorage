import { Router, type Request, type Response } from 'express';
import { createRackSchema, updateRackSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { hierarchyService } from '../modules/storage/hierarchy.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

// All storage hierarchy mutations and reads require authentication, a completed forced
// password change, and storage RBAC. Facility scoping is enforced per route by
// requireFacilityScope against the owning facility.
const rackRouter = Router();

rackRouter.use(authenticate);
rackRouter.use(requirePasswordChanged);

rackRouter.post(
  '/chambers/:chamberId/racks',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForChamber(getParamId(req.params.chamberId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createRackSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const chamberId = getParamId(req.params.chamberId);
      const rack = await hierarchyService.createRack(chamberId, parseResult.data);
      res.status(201).json({ rack });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Rack creation failed');
    }
  },
);

rackRouter.get(
  '/chambers/:chamberId/racks',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForChamber(getParamId(req.params.chamberId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chamberId = getParamId(req.params.chamberId);
      const racks = await hierarchyService.listRacks(chamberId);
      res.status(200).json({ items: racks, total: racks.length });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list racks');
    }
  },
);

rackRouter.get(
  '/racks/:rackId',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForRack(getParamId(req.params.rackId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rackId = getParamId(req.params.rackId);
      const rack = await hierarchyService.getRackById(rackId);
      if (!rack) {
        res.status(404).json({ error: 'Rack not found' });
        return;
      }
      res.status(200).json({ rack });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get rack');
    }
  },
);

rackRouter.patch(
  '/racks/:rackId',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForRack(getParamId(req.params.rackId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateRackSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const rackId = getParamId(req.params.rackId);
      const updated = await hierarchyService.updateRack(rackId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Rack not found' });
        return;
      }
      res.status(200).json({ rack: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Rack update failed';
      const status =
        message.includes('already exists') || message.includes('active') || message.includes('inactive')
          ? 409
          : 400;
      res.status(status).json({ error: message });
    }
  },
);

export { rackRouter };
