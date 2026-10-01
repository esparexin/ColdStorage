import { Router, type Request, type Response } from 'express';
import {
  createChamberSchema,
  createLevelSchema,
  createPositionSchema,
  createRackSchema,
  updateChamberSchema,
  updateLevelSchema,
  updatePositionSchema,
  updateRackSchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { hierarchyService } from '../modules/storage/hierarchy.service.js';
import { getParamId } from '../utils/params.js';

export const hierarchyRouter = Router();

hierarchyRouter.use(authenticate);
hierarchyRouter.use(requirePasswordChanged);

// ==================== CHAMBERS ====================
hierarchyRouter.post(
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
      const message = err instanceof Error ? err.message : 'Chamber creation failed';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);

hierarchyRouter.get(
  '/facilities/:facilityId/chambers',
  requirePermission('storage:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const facilityId = getParamId(req.params.facilityId);
      const chambers = await hierarchyService.listChambers(facilityId);
      res.status(200).json({ items: chambers, total: chambers.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list chambers';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.get(
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
      const message = err instanceof Error ? err.message : 'Failed to get chamber';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.patch(
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

// ==================== RACKS ====================
hierarchyRouter.post(
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
      const message = err instanceof Error ? err.message : 'Rack creation failed';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);

hierarchyRouter.get(
  '/chambers/:chamberId/racks',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForChamber(getParamId(req.params.chamberId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chamberId = getParamId(req.params.chamberId);
      const racks = await hierarchyService.listRacks(chamberId);
      res.status(200).json({ items: racks, total: racks.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list racks';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.get(
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
      const message = err instanceof Error ? err.message : 'Failed to get rack';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.patch(
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

// ==================== LEVELS ====================
hierarchyRouter.post(
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
      const message = err instanceof Error ? err.message : 'Level creation failed';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);

hierarchyRouter.get(
  '/racks/:rackId/levels',
  requirePermission('storage:view'),
  requireFacilityScope(async (req) => hierarchyService.resolveFacilityIdForRack(getParamId(req.params.rackId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rackId = getParamId(req.params.rackId);
      const levels = await hierarchyService.listLevels(rackId);
      res.status(200).json({ items: levels, total: levels.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list levels';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.get(
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
      const message = err instanceof Error ? err.message : 'Failed to get level';
      res.status(500).json({ error: message });
    }
  },
);

hierarchyRouter.patch(
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

// ==================== POSITIONS ====================
hierarchyRouter.post(
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
      const message = err instanceof Error ? err.message : 'Position creation failed';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);

hierarchyRouter.get(
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

hierarchyRouter.get(
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

hierarchyRouter.patch(
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
      const message = err instanceof Error ? err.message : 'Position update failed';
      const status = message.includes('already exists') || message.includes('inactive') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);
