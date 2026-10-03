import { Router, type Request, type Response } from 'express';
import { createLevelSchema, updateLevelSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { hierarchyService } from '../modules/storage/hierarchy.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

// All storage hierarchy mutations and reads require authentication, a completed forced
// password change, and storage RBAC. Facility scoping is enforced per route by
// requireFacilityScope against the owning facility.
const levelRouter = Router();

levelRouter.use(authenticate);
levelRouter.use(requirePasswordChanged);

levelRouter.post(
  '/racks/:rackId/levels',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForRack(getParamId(req.params.rackId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createLevelSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const rackId = getParamId(req.params.rackId);
      const level = await hierarchyService.createLevel(rackId, parseResult.data);
      res.status(201).json({ level });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Level creation failed');
    }
  },
);

levelRouter.get(
  '/racks/:rackId/levels',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForRack(getParamId(req.params.rackId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rackId = getParamId(req.params.rackId);
      const levels = await hierarchyService.listLevels(rackId);
      res.status(200).json({ items: levels, total: levels.length });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list levels');
    }
  },
);

levelRouter.get(
  '/levels/:levelId',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForLevel(getParamId(req.params.levelId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const levelId = getParamId(req.params.levelId);
      const level = await hierarchyService.getLevelById(levelId);
      if (!level) {
        res.status(404).json({ error: 'Level not found' });
        return;
      }
      res.status(200).json({ level });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get level');
    }
  },
);

levelRouter.patch(
  '/levels/:levelId',
  requirePermission('storage:manage'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForLevel(getParamId(req.params.levelId))),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateLevelSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const levelId = getParamId(req.params.levelId);
      const updated = await hierarchyService.updateLevel(levelId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Level not found' });
        return;
      }
      res.status(200).json({ level: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Level update failed';
      const status =
        message.includes('already exists') || message.includes('active') || message.includes('inactive')
          ? 409
          : 400;
      res.status(status).json({ error: message });
    }
  },
);

export { levelRouter };
