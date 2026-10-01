import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { exportDateRangeQuerySchema, stockSummaryExportQuerySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { exportService } from '../modules/import-export/export.service.js';
import { importService } from '../modules/import-export/import.service.js';
import { getParamId } from '../utils/params.js';

export const importExportRouter = Router();

importExportRouter.use(authenticate);
importExportRouter.use(requirePasswordChanged);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('INVALID_FILE_EXTENSION: Only .csv files are supported'));
    }
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'text/plain',
      'application/csv',
      'text/x-csv',
      'application/x-csv',
    ];
    if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
      return cb(new Error('INVALID_MIME_TYPE: File MIME type must be text/csv'));
    }
    cb(null, true);
  },
});

const uploadSingleCsv = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File size exceeds 2 MB limit' });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: "Multipart form field name must be 'file'" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: 'File upload error' });
      return;
    }

    if (!req.file) {
      res
        .status(400)
        .json({ error: "No file uploaded or multipart form field name is not 'file'" });
      return;
    }

    next();
  });
};

// ============================================================================
// IMPORT ROUTES
// ============================================================================

/**
 * POST /facilities/:facilityId/import/customers
 */
importExportRouter.post(
  '/facilities/:facilityId/import/customers',
  requirePermission('import:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  uploadSingleCsv,
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    try {
      const summary = await importService.importCustomers(facilityId, req.file!.buffer);
      res.status(200).json(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Customer import failed';
      res.status(400).json({ error: message });
    }
  },
);

/**
 * POST /facilities/:facilityId/import/grns
 */
importExportRouter.post(
  '/facilities/:facilityId/import/grns',
  requirePermission('import:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  uploadSingleCsv,
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    try {
      const summary = await importService.importGrns(
        facilityId,
        req.file!.buffer,
        req.user!.userId,
      );
      res.status(200).json(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GRN import failed';
      res.status(400).json({ error: message });
    }
  },
);

// ============================================================================
// EXPORT ROUTES
// ============================================================================

/**
 * GET /facilities/:facilityId/export/grns
 */
importExportRouter.get(
  '/facilities/:facilityId/export/grns',
  requirePermission('export:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = exportDateRangeQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    try {
      await exportService.exportGrns(facilityId, parseResult.data, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
      }
    }
  },
);

/**
 * GET /facilities/:facilityId/export/deliveries
 */
importExportRouter.get(
  '/facilities/:facilityId/export/deliveries',
  requirePermission('export:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = exportDateRangeQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    try {
      await exportService.exportDeliveries(facilityId, parseResult.data, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
      }
    }
  },
);

/**
 * GET /facilities/:facilityId/export/inventory-ledger
 */
importExportRouter.get(
  '/facilities/:facilityId/export/inventory-ledger',
  requirePermission('export:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = exportDateRangeQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    try {
      await exportService.exportInventoryLedger(facilityId, parseResult.data, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
      }
    }
  },
);

/**
 * GET /facilities/:facilityId/export/customers
 */
importExportRouter.get(
  '/facilities/:facilityId/export/customers',
  requirePermission('export:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = exportDateRangeQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    try {
      await exportService.exportCustomers(facilityId, parseResult.data, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
      }
    }
  },
);

/**
 * GET /facilities/:facilityId/export/stock-summary
 */
importExportRouter.get(
  '/facilities/:facilityId/export/stock-summary',
  requirePermission('export:execute'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = stockSummaryExportQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Stock summary export does not accept date filter query parameters',
        details: parseResult.error.flatten(),
      });
      return;
    }
    try {
      await exportService.exportStockSummary(facilityId, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
      }
    }
  },
);
