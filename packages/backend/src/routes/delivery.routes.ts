import { Router, type Request, type Response } from 'express';
import { createDeliverySchema, deliveryQuerySchema, reverseDeliverySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { ConcurrencyConflictError } from '../modules/inventory/inventory.service.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { getParamId } from '../utils/params.js';

export const deliveryRouter = Router();

deliveryRouter.use(authenticate);
deliveryRouter.use(requirePasswordChanged);

// 1. Issue Outward Delivery Challan
deliveryRouter.post(
  '/facilities/:facilityId/deliveries',
  requirePermission('delivery:create'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);

    if (req.body && typeof req.body.facilityId === 'string' && req.body.facilityId !== facilityId) {
      res.status(400).json({
        error: `Payload facilityId '${req.body.facilityId}' does not match route facilityId '${facilityId}'`,
      });
      return;
    }

    const parseResult = createDeliverySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    // Verify GRN child-ID belongs to facility
    const grnFacilityId = await inventoryService.resolveFacilityIdForGrn(parseResult.data.grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${parseResult.data.grnId}' not found in facility '${facilityId}'` });
      return;
    }

    try {
      const { delivery, summary } = await deliveryService.createDelivery(
        facilityId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(201).json({ delivery, summary });
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
      const message = err instanceof Error ? err.message : 'Delivery creation failed';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('inactive') ||
              message.includes('exceeds') ||
              message.includes('CLOSED') ||
              message.includes('belongs to chamber') ||
              message.includes('future') ||
              message.includes('Financial Year')
            ? 400
            : 500;
      res.status(status).json({ error: message });
    }
  },
);

// 2. List Delivery Challans
deliveryRouter.get(
  '/facilities/:facilityId/deliveries',
  requirePermission('delivery:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const parseResult = deliveryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }

    try {
      const result = await deliveryService.listDeliveries(facilityId, parseResult.data);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list deliveries';
      res.status(500).json({ error: message });
    }
  },
);

// 3. Get Single Delivery Challan by ID
deliveryRouter.get(
  '/facilities/:facilityId/deliveries/:deliveryId',
  requirePermission('delivery:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const deliveryId = getParamId(req.params.deliveryId);

    const deliveryFacilityId = await deliveryService.resolveFacilityIdForDelivery(deliveryId);
    if (!deliveryFacilityId || deliveryFacilityId !== facilityId) {
      res.status(404).json({ error: `Delivery '${deliveryId}' not found in facility '${facilityId}'` });
      return;
    }

    try {
      const delivery = await deliveryService.getDeliveryById(facilityId, deliveryId);
      if (!delivery) {
        res.status(404).json({ error: `Delivery '${deliveryId}' not found` });
        return;
      }
      res.status(200).json({ delivery });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get delivery';
      res.status(500).json({ error: message });
    }
  },
);

// 4. Reverse a Confirmed Delivery Challan (Full Reversal Only)
deliveryRouter.post(
  '/facilities/:facilityId/deliveries/:deliveryId/reverse',
  requirePermission('delivery:reversal'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const deliveryId = getParamId(req.params.deliveryId);

    const deliveryFacilityId = await deliveryService.resolveFacilityIdForDelivery(deliveryId);
    if (!deliveryFacilityId || deliveryFacilityId !== facilityId) {
      res.status(404).json({ error: `Delivery '${deliveryId}' not found in facility '${facilityId}'` });
      return;
    }

    const parseResult = reverseDeliverySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const { reversal, challan, summary } = await deliveryService.reverseDelivery(
        facilityId,
        deliveryId,
        parseResult.data,
        req.user!.userId,
      );
      res.status(200).json({ reversal, challan, summary });
    } catch (err: unknown) {
      if (err instanceof ConcurrencyConflictError) {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : 'Delivery reversal failed';
      const status =
        message.includes('not found')
          ? 404
          : message.includes('already REVERSED') ||
              message.includes('exceeds available capacity') ||
              message.includes('inactive')
            ? 400
            : 500;
      res.status(status).json({ error: message });
    }
  },
);

// 5. List Deliveries for specific GRN
deliveryRouter.get(
  '/facilities/:facilityId/grns/:grnId/deliveries',
  requirePermission('delivery:view'),
  requireFacilityScope((req) => getParamId(req.params.facilityId)),
  async (req: Request, res: Response): Promise<void> => {
    const facilityId = getParamId(req.params.facilityId);
    const grnId = getParamId(req.params.grnId);

    const grnFacilityId = await inventoryService.resolveFacilityIdForGrn(grnId);
    if (!grnFacilityId || grnFacilityId !== facilityId) {
      res.status(404).json({ error: `GRN '${grnId}' not found in facility '${facilityId}'` });
      return;
    }

    try {
      const deliveries = await deliveryService.listDeliveriesForGrn(facilityId, grnId);
      res.status(200).json({ deliveries });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list deliveries for GRN';
      res.status(500).json({ error: message });
    }
  },
);
