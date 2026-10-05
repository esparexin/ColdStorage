import { Router, type Request, type Response } from 'express';
import {
  correctGrnSchema,
  createGrnSchema,
  grnQuerySchema,
  updateGrnLoanStatusSchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { grnService } from '../modules/grn/grn.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const grnRouter = Router();

grnRouter.use(authenticate);
grnRouter.use(requirePasswordChanged);

// Create Inward Goods Receipt Note
grnRouter.post(
  '/facilities/:facilityId/grns',
  requirePermission('grn:create'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    // Ensure client body does not contradict the authorized route facilityId
    if (req.body && typeof req.body.facilityId === 'string' && req.body.facilityId !== facilityId) {
      res.status(400).json({
        error: `Payload facilityId '${req.body.facilityId}' does not match route facilityId '${facilityId}'`,
      });
      return;
    }

    const parseResult = createGrnSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const { grn, acknowledgement } = await grnService.createGrn(facilityId, parseResult.data, req.user!.userId);
      res.status(201).json({ grn, acknowledgement });
    } catch (err: unknown) {
      const isDuplicate =
        (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) ||
        (err instanceof Error && err.message.includes('already exists'));
      if (isDuplicate) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Bill Number already exists' });
        return;
      }
      const message = err instanceof Error ? err.message : 'GRN creation failed';
      const status =
        message.includes('not found') ||
        message.includes('inactive') ||
        message.includes('not registered') ||
        message.includes('does not belong') ||
        message.includes('future') ||
        message.includes('exceeds permitted') ||
        message.includes('Financial Year')
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  },
);

// List GRNs for facility
grnRouter.get(
  '/facilities/:facilityId/grns',
  requirePermission('grn:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = grnQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await grnService.listGrns(facilityId, parseResult.data);
      res.status(200).json(result);
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list GRNs');
    }
  },
);

// Preview next Bill Number for facility
grnRouter.get(
  '/facilities/:facilityId/grns/next-bill-number',
  requirePermission('grn:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    try {
      const nextBillNumber = await grnService.getNextBillNumber(facilityId);
      res.status(200).json({ nextBillNumber });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to preview next bill number');
    }
  },
);

// Get single GRN by ID (with child-ID scope-bypass protection)
grnRouter.get(
  '/grns/:grnId',
  requirePermission('grn:view'),
  requireFacilityScope(async (req) => grnService.resolveFacilityIdForGrn(getParamId(req.params.grnId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const grnId = getParamId(req.params.grnId);
      const grn = await grnService.getGrnById(grnId);
      if (!grn) {
        res.status(404).json({ error: 'GRN not found' });
        return;
      }
      res.status(200).json({ grn });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get GRN');
    }
  },
);

// Get Inward Acknowledgement projection by GRN ID
grnRouter.get(
  '/grns/:grnId/acknowledgement',
  requirePermission('grn:view'),
  requireFacilityScope(async (req) => grnService.resolveFacilityIdForGrn(getParamId(req.params.grnId))),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const grnId = getParamId(req.params.grnId);
      const acknowledgement = await grnService.getAcknowledgementByGrnId(grnId);
      if (!acknowledgement) {
        res.status(404).json({ error: 'GRN not found' });
        return;
      }
      res.status(200).json({ acknowledgement });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get GRN acknowledgement');
    }
  },
);

// Get Bond Movement History (authoritative read-only passbook)
grnRouter.get(
  '/facilities/:facilityId/grns/:grnId/movement-history',
  requirePermission('grn:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);

    const grnFacilityId = await grnService.resolveFacilityIdForGrn(grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${grnId}' not found in facility '${facilityId}'` });
      return;
    }

    try {
      const history = await grnService.getGrnMovementHistory(facilityId, grnId);
      if (!history) {
        res.status(404).json({ error: `GRN '${grnId}' movement history not found` });
        return;
      }
      res.status(200).json({ history });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get GRN movement history');
    }
  },
);

// Correct an inward receipt's commodity, bag count or chamber (authorized workflow).
grnRouter.patch(
  '/facilities/:facilityId/grns/:grnId',
  requirePermission('grn:correct'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);

    const grnFacilityId = await grnService.resolveFacilityIdForGrn(grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${grnId}' not found in facility '${facilityId}'` });
      return;
    }

    const parseResult = correctGrnSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const grn = await grnService.correctGrn(facilityId, grnId, parseResult.data, req.user!.userId);
      res.status(200).json({ grn });
    } catch (err: unknown) {
      sendServiceError(res, err, 'GRN correction failed');
    }
  },
);

// Update GRN Loan/Bond Status (e.g. Loan Taken, Loan Cleared, Loan Not Taken)
grnRouter.patch(
  '/facilities/:facilityId/grns/:grnId/loan-status',
  requirePermission('grn:create'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);

    const grnFacilityId = await grnService.resolveFacilityIdForGrn(grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${grnId}' not found in facility '${facilityId}'` });
      return;
    }

    const parseResult = updateGrnLoanStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const grn = await grnService.updateLoanStatus(facilityId, grnId, parseResult.data, req.user!.userId);
      res.status(200).json({ grn });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Updating GRN loan status failed');
    }
  },
);

