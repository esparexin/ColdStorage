import { Router, type Request, type Response } from 'express';
import { createFacilitySchema, updateFacilitySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { facilityService } from '../modules/storage/facility.service.js';
import { getParamId } from '../utils/params.js';

export const facilityRouter = Router();

facilityRouter.use(authenticate);
facilityRouter.use(requirePasswordChanged);

facilityRouter.post('/', requirePermission('storage:manage'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = createFacilitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const facility = await facilityService.createFacility(parseResult.data);
    res.status(201).json({ facility });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Facility creation failed';
    const status = message.includes('already exists') ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

facilityRouter.get('/', requirePermission('storage:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const facilities = await facilityService.listFacilities(req.user!.facilityIds, isSuperAdmin);
    res.status(200).json({ items: facilities, total: facilities.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list facilities';
    res.status(500).json({ error: message });
  }
});

facilityRouter.get(
  '/:facilityId',
  requirePermission('storage:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const facilityId = getParamId(req.params.facilityId);
      const facility = await facilityService.getFacilityById(facilityId);
      if (!facility) {
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      res.status(200).json({ facility });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get facility';
      res.status(500).json({ error: message });
    }
  },
);

facilityRouter.patch(
  '/:facilityId',
  requirePermission('storage:manage'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateFacilitySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const facilityId = getParamId(req.params.facilityId);
      const updated = await facilityService.updateFacility(facilityId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      res.status(200).json({ facility: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Facility update failed';
      const status = message.includes('active chambers') || message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);
