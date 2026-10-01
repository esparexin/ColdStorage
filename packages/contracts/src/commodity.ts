import { z } from 'zod';

export const commoditySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createCommoditySchema = z.object({
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
});

export const updateCommoditySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type Commodity = z.infer<typeof commoditySchema>;
export type CreateCommodityInput = z.infer<typeof createCommoditySchema>;
export type UpdateCommodityInput = z.infer<typeof updateCommoditySchema>;
