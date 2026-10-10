import { z } from 'zod';
import { bagPriceSchema } from './pricing.js';
import { rentTypeSchema } from './grn-rent.js';

/**
 * Price Controller rate SSOT (same-GRN lifecycle).
 *
 * One authoritative rate row per (commodity, rent type). Seasonal and monthly
 * rates are stored separately and stay distinct even when numerically equal:
 * - Seasonal small/big rate = total per-bag price for the whole season.
 * - Monthly small/big rate = per-bag price for one month.
 *
 * Historical GRN obligations are never rewritten from these rows; the backend
 * validates newly submitted rates against the active row and records the
 * agreed rate immutably on the GRN / period row at finalization time.
 */
export const commodityRateSchema = z.object({
  id: z.string().min(1),
  commodityId: z.string().min(1),
  rentType: rentTypeSchema,
  smallRate: bagPriceSchema,
  bigRate: bagPriceSchema,
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type CommodityRate = z.infer<typeof commodityRateSchema>;

export const upsertCommodityRateSchema = z.object({
  commodityId: z.string().trim().min(1, 'Commodity ID is required'),
  rentType: rentTypeSchema,
  smallRate: bagPriceSchema,
  bigRate: bagPriceSchema,
  isActive: z.boolean().optional(),
});

export type UpsertCommodityRateInput = z.infer<typeof upsertCommodityRateSchema>;

export const commodityRateQuerySchema = z.object({
  commodityId: z.string().trim().min(1, 'Commodity ID is required'),
  rentType: rentTypeSchema,
});

export type CommodityRateQuery = z.infer<typeof commodityRateQuerySchema>;

export interface RateForBags {
  small: number;
  big: number;
}

/** Picks the applicable small/big pair from an active rate row. */
export function pickRateForBags(rate: Pick<CommodityRate, 'smallRate' | 'bigRate'>): RateForBags {
  return { small: rate.smallRate, big: rate.bigRate };
}
