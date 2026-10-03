import { Router, type Request, type Response } from 'express';
import { createCommoditySchema, updateCommoditySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { commodityService } from '../modules/commodities/commodity.service.js';
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
