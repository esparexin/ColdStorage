import { z } from 'zod';
import { hamaliRateSchema } from './hamali.js';

export const seasonDurationSchema = z.enum(['Seasonal', 'Seasonal_3M']);
export type SeasonDuration = z.infer<typeof seasonDurationSchema>;

export const commoditySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  seasonDuration: seasonDurationSchema.optional(),
  isHamaliApplicable: z.boolean().optional().default(false),
  hamaliRate: hamaliRateSchema.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createCommoditySchema = z.object({
  name: z.string().trim().min(1).max(100),
  seasonDuration: seasonDurationSchema.optional().default('Seasonal'),
  isHamaliApplicable: z.boolean().optional().default(false),
  hamaliRate: hamaliRateSchema.optional().default(0),
  isActive: z.boolean().default(true),
});

export const updateCommoditySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  seasonDuration: seasonDurationSchema.optional(),
  isHamaliApplicable: z.boolean().optional(),
  hamaliRate: hamaliRateSchema.optional(),
  isActive: z.boolean().optional(),
});

export type Commodity = z.infer<typeof commoditySchema>;
export type CreateCommodityInput = z.infer<typeof createCommoditySchema>;
export type UpdateCommodityInput = z.infer<typeof updateCommoditySchema>;

