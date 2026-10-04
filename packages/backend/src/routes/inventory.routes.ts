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

// 3. Get derived GRN inventory allocation summary
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


// 4. Get facility inventory stock summary
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

// 6. Query filtered, paginated immutable stock ledger
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
