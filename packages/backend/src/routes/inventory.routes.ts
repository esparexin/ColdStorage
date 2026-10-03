import { Router, type Request, type Response } from 'express';
import { createPutAwaySchema, stockLedgerQuerySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { ConcurrencyConflictError, inventoryService } from '../modules/inventory/inventory.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { getParamId } from '../utils/params.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);
inventoryRouter.use(requirePasswordChanged);

// 1. Create put-away allocation for GRN
inventoryRouter.post(
  '/facilities/:facilityId/grns/:grnId/allocations',
  requirePermission('rack:allocate'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);

    // Verify child-ID belongs to facility
    const grnFacilityId = await grnService.resolveFacilityIdForGrn(grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${grnId}' not found in facility '${facilityId}'` });
      return;
    }

    if (req.body && typeof req.body.facilityId === 'string' && req.body.facilityId !== facilityId) {
      res.status(400).json({
        error: `Payload facilityId '${req.body.facilityId}' does not match route facilityId '${facilityId}'`,
      });
      return;
    }

    const parseResult = createPutAwaySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const { putAway, summary } = await inventoryService.createPutAway(
        facilityId,
        grnId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(201).json({ putAway, summary });
    } catch (err: unknown) {
      if (err instanceof ConcurrencyConflictError) {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof RentPaymentRequiredError) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
          rent: {
            grnId: err.grnId,
            grnNumber: err.grnNumber,
            rentAmount: err.rentAmount,
            totalPaid: err.totalPaid,
            remainingBalance: err.remainingBalance,
          },
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Put-away allocation failed';
      const status =
        message.includes('not found') ||
        message.includes('inactive') ||
        message.includes('exceeds') ||
        message.includes('not OPEN') ||
        message.includes('belongs to chamber') ||
        message.includes('invalid')
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  },
);

// 2. List put-away batch history for GRN
inventoryRouter.get(
  '/facilities/:facilityId/grns/:grnId/allocations',
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
      const allocations = await inventoryService.listPutAwayAllocations(facilityId, grnId);
      res.status(200).json({ allocations });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list put-away allocations';
      res.status(500).json({ error: message });
    }
  },
);

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
      const message = err instanceof Error ? err.message : 'Failed to get GRN inventory summary';
      res.status(500).json({ error: message });
    }
  },
);

// 4. Get derived Position occupancy and stored batches
inventoryRouter.get(
  '/facilities/:facilityId/positions/:positionId/occupancy',
  requirePermission('inventory:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const positionId = getParamId(req.params.positionId);

    const posFacilityId = await inventoryService.resolveFacilityIdForPosition(positionId);
    if (!posFacilityId || posFacilityId !== facilityId) {
      res.status(404).json({ error: `Position '${positionId}' not found in facility '${facilityId}'` });
      return;
    }

    try {
      const occupancy = await inventoryService.getPositionOccupancy(facilityId, positionId);
      res.status(200).json({ occupancy });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get position occupancy';
      res.status(500).json({ error: message });
    }
  },
);

// 5. Get facility inventory stock summary
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
      const message = err instanceof Error ? err.message : 'Failed to get facility inventory summary';
      res.status(500).json({ error: message });
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
      const message = err instanceof Error ? err.message : 'Failed to query stock ledger';
      res.status(500).json({ error: message });
    }
  },
);
