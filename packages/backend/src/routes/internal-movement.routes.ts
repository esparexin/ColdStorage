import { Router, type Request, type Response } from 'express';
import { mergeGrnInputSchema, transferOwnershipInputSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const internalMovementRouter = Router();

internalMovementRouter.use(authenticate);
internalMovementRouter.use(requirePasswordChanged);

// Merge one or more source GRNs into an existing target GRN
internalMovementRouter.post(
  '/facilities/:facilityId/internal-movements/merge',
  requirePermission('grn:correct'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    const parseResult = mergeGrnInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await internalMovementService.mergeGrn(
        facilityId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(200).json({ success: true, ...result });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Internal Movement Merge failed');
    }
  },
);

// Transfer ownership of an existing GRN to a new customer
internalMovementRouter.post(
  '/facilities/:facilityId/internal-movements/transfer-ownership',
  requirePermission('grn:correct'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    const parseResult = transferOwnershipInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await internalMovementService.transferOwnership(
        facilityId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(200).json({ success: true, ...result });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Ownership Transfer failed');
    }
  },
);

// List internal movements for a facility
internalMovementRouter.get(
  '/facilities/:facilityId/internal-movements',
  requirePermission('grn:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    try {
      const movements = await internalMovementService.getMovementsForFacility(facilityId);
      res.status(200).json({ movements });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to fetch internal movements');
    }
  },
);

// List internal movements for a specific GRN
internalMovementRouter.get(
  '/facilities/:facilityId/internal-movements/grn/:grnId',
  requirePermission('grn:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);
    try {
      const movements = await internalMovementService.getMovementsForGrn(facilityId, grnId);
      res.status(200).json({ movements });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to fetch GRN internal movements');
    }
  },
);
