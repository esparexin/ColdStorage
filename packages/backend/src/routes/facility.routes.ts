import { Router, type Request, type Response } from 'express';
import {
  createFacilitySchema,
  facilityQuerySchema,
  hasGlobalFacilityScope,
  updateFacilitySchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { facilityService } from '../modules/facilities/facility.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const facilityRouter = Router();

facilityRouter.use(authenticate);
facilityRouter.use(requirePasswordChanged);

facilityRouter.post('/', requirePermission('settings:manage'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = createFacilitySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const facility = await facilityService.createFacility(parseResult.data);
    res.status(201).json({ facility });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Facility creation failed');
  }
});

facilityRouter.get('/', requirePermission('facility:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const query = facilityQuerySchema.safeParse(req.query);
    const includeInactive = query.success ? (query.data.includeInactive ?? false) : false;
    // Scope comes from the shared tenancy helper rather than an inline role comparison.
    const facilities = await facilityService.listFacilities(
      req.user!.facilityIds,
      hasGlobalFacilityScope(req.user!.role),
      includeInactive,
    );
    res.status(200).json({ items: facilities, total: facilities.length });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list facilities');
  }
});

facilityRouter.get(
  '/:facilityId',
  requirePermission('facility:view'),
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
      sendServiceError(res, err, 'Failed to get facility');
    }
  },
);

facilityRouter.patch(
  '/:facilityId',
  requirePermission('settings:manage'),
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
      sendServiceError(res, err, 'Facility update failed');
    }
  },
);

facilityRouter.delete(
  '/:facilityId',
  requirePermission('settings:manage'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const facilityId = getParamId(req.params.facilityId);
      const deleted = await facilityService.deleteFacility(facilityId);
      if (!deleted) {
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      res.status(200).json({ deleted: true, id: facilityId });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Facility deletion failed');
    }
  },
);
