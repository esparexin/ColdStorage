import { Router, type Request, type Response } from 'express';
import { recordRentPaymentInputSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { rentService } from '../modules/rent/rent.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const rentRouter = Router();

rentRouter.use(authenticate);
rentRouter.use(requirePasswordChanged);

// 1. Record Rent Payment against GRN obligation
rentRouter.post(
  '/facilities/:facilityId/rent/collect',
  requirePermission('rent:collect'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    if (req.body && typeof req.body.facilityId === 'string' && req.body.facilityId !== facilityId) {
      res.status(400).json({
        error: `Payload facilityId '${req.body.facilityId}' does not match route facilityId '${facilityId}'`,
      });
      return;
    }

    const parseResult = recordRentPaymentInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await rentService.recordPayment(
        facilityId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Rent payment collection failed';
      const status = message.includes('not found')
        ? 404
        : message.includes('exceeds remaining') ||
            message.includes('future') ||
            message.includes('Validation')
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  },
);

// 2. Canonical Rent Summary & Payment History Lookup
rentRouter.get(
  '/facilities/:facilityId/rent/grn/:identifier',
  requirePermission('rent:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const identifier = getParamId(req.params.identifier);

    try {
      const summary = await rentService.getRentSummary(facilityId, identifier);
      res.status(200).json(summary);
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to retrieve rent summary');
    }
  },
);

// 3. Render Printable Official Rent Receipt HTML
rentRouter.get(
  '/facilities/:facilityId/rent/receipts/:receiptNumber/print',
  requirePermission('rent:print'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const receiptNumber = getParamId(req.params.receiptNumber);

    try {
      const html = await rentService.renderReceipt(facilityId, receiptNumber, req.user!.userId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
      );
      res.status(200).send(html);
    } catch (err: unknown) {
      sendServiceError(res, err, 'Receipt rendering failed');
    }
  },
);
