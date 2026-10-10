import { Router, type Request, type Response } from 'express';
import {
  createCommoditySchema,
  rentTypeSchema,
  updateCommoditySchema,
  upsertCommodityRateSchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { commodityService } from '../modules/commodities/commodity.service.js';
import { commodityRateService } from '../modules/commodities/commodity-rate.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const commodityRouter = Router();

commodityRouter.use(authenticate);
commodityRouter.use(requirePasswordChanged);

commodityRouter.post('/', requirePermission('commodity:manage'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = createCommoditySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  try {
    const commodity = await commodityService.createCommodity(parseResult.data);
    res.status(201).json({ commodity });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Commodity creation failed');
  }
});

commodityRouter.get('/', requirePermission('commodity:view'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const commodities = await commodityService.listCommodities();
    res.status(200).json({ items: commodities, total: commodities.length });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list commodities');
  }
});

commodityRouter.get(
  '/:commodityId',
  requirePermission('commodity:view'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const commodityId = getParamId(req.params.commodityId);
      const commodity = await commodityService.getCommodityById(commodityId);
      if (!commodity) {
        res.status(404).json({ error: 'Commodity not found' });
        return;
      }
      res.status(200).json({ commodity });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get commodity');
    }
  },
);

/**
 * Price Controller lookup: active authoritative rate for one
 * (commodity, rent type) pair, or all pairs when `rentType` is omitted.
 * Read-only; historical GRN obligations are never derived here.
 */
commodityRouter.get(
  '/:commodityId/rates',
  requirePermission('commodity:view'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const commodityId = getParamId(req.params.commodityId);
      const { rentType } = req.query;

      if (rentType !== undefined) {
        const parsedType = rentTypeSchema.safeParse(rentType);
        if (!parsedType.success) {
          res.status(400).json({ error: 'Validation failed', details: parsedType.error.flatten() });
          return;
        }
        const rate = await commodityRateService.getRate(commodityId, parsedType.data);
        if (!rate) {
          res.status(404).json({ error: `No active ${parsedType.data} rate for commodity '${commodityId}'` });
          return;
        }
        res.status(200).json({ rate });
        return;
      }

      const rates = await commodityRateService.listRates(commodityId);
      res.status(200).json({ items: rates, total: rates.length });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get commodity rates');
    }
  },
);

/**
 * Price Controller management: creates or replaces the authoritative rate
 * row for one (commodity, rent type) pair. Restricted to commodity managers.
 * Never reprices existing GRNs or payments.
 */
commodityRouter.put(
  '/:commodityId/rates',
  requirePermission('commodity:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const commodityId = getParamId(req.params.commodityId);
    const parseResult = upsertCommodityRateSchema.safeParse({ ...req.body, commodityId });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const rate = await commodityRateService.upsertRate(parseResult.data);
      res.status(200).json({ rate });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Commodity rate update failed');
    }
  },
);

commodityRouter.patch(
  '/:commodityId',
  requirePermission('commodity:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateCommoditySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const commodityId = getParamId(req.params.commodityId);
      const updated = await commodityService.updateCommodity(commodityId, parseResult.data);
      if (!updated) {
        res.status(404).json({ error: 'Commodity not found' });
        return;
      }
      res.status(200).json({ commodity: updated });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Commodity update failed');
    }
  },
);
