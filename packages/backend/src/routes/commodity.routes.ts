import { Router, type Request, type Response } from 'express';
import { createCommoditySchema, updateCommoditySchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { commodityService } from '../modules/commodities/commodity.service.js';
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
    const message = err instanceof Error ? err.message : 'Commodity creation failed';
    const status = message.includes('already exists') ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

commodityRouter.get('/', requirePermission('commodity:view'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const commodities = await commodityService.listCommodities();
    res.status(200).json({ items: commodities, total: commodities.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list commodities';
    res.status(500).json({ error: message });
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
      const message = err instanceof Error ? err.message : 'Failed to get commodity';
      res.status(500).json({ error: message });
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
      const message = err instanceof Error ? err.message : 'Commodity update failed';
      const status = message.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  },
);
