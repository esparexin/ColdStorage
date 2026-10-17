import type { Request, Response } from 'express';
import { asyncRouter } from '../utils/async-handler.js';
import { documentFormatQuerySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { documentService } from '../modules/documents/document.service.js';
import { getParamId } from '../utils/params.js';
import { sendInternalError } from '../utils/http-error.js';

export const documentRouter = asyncRouter();

documentRouter.use(authenticate);
documentRouter.use(requirePasswordChanged);

function sendHtmlDocument(res: Response, html: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
  );
  res.status(200).send(html);
}

function handleDocumentError(err: unknown, res: Response): void {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('ORGANIZATION_NOT_CONFIGURED')) {
    res.status(400).json({
      error:
        'Organization details must be configured by an administrator before generating official documents',
      code: 'ORGANIZATION_NOT_CONFIGURED',
    });
    return;
  }
  if (message.includes('FACILITY_MISMATCH')) {
    // Phase 9 architectural lock: facility mismatch locked to HTTP 404
    res.status(404).json({
      error: 'Requested document not found within the specified facility scope',
      code: 'FACILITY_MISMATCH',
    });
    return;
  }
  if (message.includes('NOT_FOUND')) {
    res.status(404).json({
      error: message,
      code: 'NOT_FOUND',
    });
    return;
  }
  // The raw `message` is deliberately dropped here: this path returns a
  // rendered customer document and the underlying error can carry internal
  // structure (collection names, index names, driver codes). The detail is
  // logged with a correlation id instead.
  sendInternalError(res, err, 'Document rendering failed');
}

/**
 * GET /facilities/:facilityId/documents/grn/:grnId
 * Renders HTML Goods Receipt Note with free-text chamber label (no positions).
 */
documentRouter.get(
  '/facilities/:facilityId/documents/grn/:grnId',
  requirePermission('document:print'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const formatParse = documentFormatQuerySchema.safeParse(req.query);
    if (!formatParse.success) {
      res.status(400).json({ error: 'Validation failed', details: formatParse.error.flatten() });
      return;
    }

    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);
    const userId = req.user?.username ?? req.user?.userId ?? 'SYSTEM';

    try {
      const html = await documentService.renderGrnDocument(facilityId, grnId, userId);
      sendHtmlDocument(res, html);
    } catch (err: unknown) {
      handleDocumentError(err, res);
    }
  },
);

/**
 * GET /facilities/:facilityId/documents/receipt/:grnId
 * Renders HTML Farmer Inward Acknowledgement Receipt.
 */
documentRouter.get(
  '/facilities/:facilityId/documents/receipt/:grnId',
  requirePermission('document:print'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const formatParse = documentFormatQuerySchema.safeParse(req.query);
    if (!formatParse.success) {
      res.status(400).json({ error: 'Validation failed', details: formatParse.error.flatten() });
      return;
    }

    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);
    const userId = req.user?.username ?? req.user?.userId ?? 'SYSTEM';

    try {
      const html = await documentService.renderReceiptDocument(facilityId, grnId, userId);
      sendHtmlDocument(res, html);
    } catch (err: unknown) {
      handleDocumentError(err, res);
    }
  },
);

/**
 * GET /facilities/:facilityId/documents/challan/:challanId
 * Renders HTML Outward Delivery Challan & Gate Pass.
 */
documentRouter.get(
  '/facilities/:facilityId/documents/challan/:challanId',
  requirePermission('document:print'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const formatParse = documentFormatQuerySchema.safeParse(req.query);
    if (!formatParse.success) {
      res.status(400).json({ error: 'Validation failed', details: formatParse.error.flatten() });
      return;
    }

    const facilityId = getParamId(req.params.facilityId);
    const challanId = getParamId(req.params.challanId);
    const userId = req.user?.username ?? req.user?.userId ?? 'SYSTEM';

    try {
      const html = await documentService.renderChallanDocument(facilityId, challanId, userId);
      sendHtmlDocument(res, html);
    } catch (err: unknown) {
      handleDocumentError(err, res);
    }
  },
);

/**
 * GET /facilities/:facilityId/documents/rent-receipt/preview
 * Renders HTML Rent Payment Receipt Preview (pure preview, zero mutations).
 */
documentRouter.get(
  '/facilities/:facilityId/documents/rent-receipt/preview',
  requirePermission('document:print'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const formatParse = documentFormatQuerySchema.safeParse(req.query);
    if (!formatParse.success) {
      res.status(400).json({ error: 'Validation failed', details: formatParse.error.flatten() });
      return;
    }

    const facilityId = getParamId(req.params.facilityId);
    const userId = req.user?.username ?? req.user?.userId ?? 'SYSTEM';

    const rawAmount = req.query.amount ? Number(req.query.amount) : undefined;
    const amount =
      rawAmount !== undefined && Number.isFinite(rawAmount) && rawAmount >= 0 && rawAmount <= 1e9
        ? rawAmount
        : undefined;
    if (req.query.amount !== undefined && amount === undefined) {
      res.status(400).json({ error: 'Invalid amount: must be a finite number between 0 and 1000000000' });
      return;
    }
    const rawCustomerName = typeof req.query.customerName === 'string' ? req.query.customerName : undefined;
    const customerName = rawCustomerName?.slice(0, 100);
    const paymentMode =
      req.query.paymentMode === 'UPI' || req.query.paymentMode === 'Cash'
        ? req.query.paymentMode
        : undefined;

    try {
      const html = await documentService.renderRentReceiptPreview(facilityId, userId, {
        customerName,
        amount,
        paymentMode,
      });
      sendHtmlDocument(res, html);
    } catch (err: unknown) {
      handleDocumentError(err, res);
    }
  },
);
