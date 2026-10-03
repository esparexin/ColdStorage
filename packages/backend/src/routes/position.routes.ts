import { Router, type Request, type Response } from 'express';
import { createPositionSchema, updatePositionSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { hierarchyService } from '../modules/storage/hierarchy.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

// All storage hierarchy mutations and reads require authentication, a completed forced
// password change, and storage RBAC. Facility scoping is enforced per route by
// requireFacilityScope against the owning facility.
const positionRouter = Router();

positionRouter.use(authenticate);
positionRouter.use(requirePasswordChanged);

positionRouter.post(
  '/levels/:levelId/positions',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForLevel(getParamId(req.params.levelId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createPositionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const levelId = getParamId(req.params.levelId);
      const position = await hierarchyService.createPosition(levelId, parseResult.data);
      res.status(201).json({ position });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Position creation failed');
    }
  },
);

positionRouter.get(
  '/levels/:levelId/positions',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForLevel(getParamId(req.params.levelId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const levelId = getParamId(req.params.levelId);
      const positions = await hierarchyService.listPositions(levelId);
      res.status(200).json({ items: positions, total: positions.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list positions';
      res.status(500).json({ error: message });
    }
  },
);

positionRouter.get(
  '/positions/:positionId',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForPosition(getParamId(req.params.positionId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const positionId = getParamId(req.params.positionId);
      const position = await hierarchyService.getPositionById(positionId);
      if (!position) {
        res.status(404).json({ error: 'Position not found' });
        return;
      }
      res.status(200).json({ position });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get position';
      res.status(500).json({ error: message });
    }
  },
);

positionRouter.patch(
  '/positions/:positionId',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForPosition(getParamId(req.params.positionId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updatePositionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const positionId = getParamId(req.params.positionId);
      const updated = await hierarchyService.updatePosition(positionId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Position not found' });
        return;
      }
      res.status(200).json({ position: updated });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Position update failed');
    }
  },
);

export { positionRouter };
