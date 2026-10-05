import { Router, type Request, type Response } from 'express';
import { stockLedgerQuerySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);
inventoryRouter.use(requirePasswordChanged);

// 1. Get derived GRN inventory summary
inventoryRouter.get(
  '/facilities/:facilityId/grns/:grnId/inventory-summary',
  requirePermission('inventory:view'),
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
      const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
      res.status(200).json({ summary });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get GRN inventory summary');
    }
  },
);

// 2. Get facility inventory stock summary
inventoryRouter.get(
  '/facilities/:facilityId/inventory',
  requirePermission('inventory:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    try {
      const summary = await inventoryService.getFacilityInventorySummary(facilityId);
      res.status(200).json({ summary });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get facility inventory summary');
    }
  },
);

// 3. Query filtered, paginated stock ledger
inventoryRouter.get(
  '/facilities/:facilityId/inventory/ledger',
  requirePermission('inventory:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = stockLedgerQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await inventoryService.queryStockLedger(facilityId, parseResult.data);
      res.status(200).json(result);
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to query stock ledger');
    }
  },
);

// 4. Customer stock rollup, aggregated at read time over that customer's receipts
inventoryRouter.get(
  '/facilities/:facilityId/inventory/customer/:customerId',
  requirePermission('inventory:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const customerId = getParamId(req.params.customerId);
    try {
      const summary = await inventoryService.getCustomerStockSummary(facilityId, customerId);
      res.status(200).json({ summary });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get customer stock summary');
    }
  },
);
