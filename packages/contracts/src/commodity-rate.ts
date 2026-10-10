import { z } from 'zod';
import type { BagType } from './bags.js';
import { bagPriceSchema, calculateRentAmount } from './pricing.js';
import { rentTypeSchema } from './grn-rent.js';
import type { ExtensionPeriod } from './rent-extension.js';

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

/**
 * Same-GRN period charge from a month-start snapshot, via the canonical
 * `calculateRentAmount` SSOT (no duplicated formula).
 * - SEASON: whole-season total (never × months).
 * - JANUARY/FEBRUARY: one month at the monthly rate.
 * S+B snapshots keep their small/big split; single bag types resolve to the
 * matching side (S and informational S/B resolve to the small-bag rate).
 */
export function calculatePeriodRent(input: {
  period: ExtensionPeriod;
  bagType: BagType | null | undefined;
  snapshotSmallBags: number;
  snapshotBigBags: number;
  smallRate: number;
  bigRate: number;
}): number {
  const total = input.snapshotSmallBags + input.snapshotBigBags;
  const useSplit = input.bagType === 'S+B';
  return calculateRentAmount({
    rentType: input.period === 'SEASON' ? 'Seasonal' : 'Monthly',
    bags: total,
    bagType: input.bagType ?? undefined,
    smallBags: input.snapshotSmallBags,
    bigBags: input.snapshotBigBags,
    smallBagPrice: useSplit ? input.smallRate : undefined,
    bigBagPrice: useSplit ? input.bigRate : undefined,
    bagPrice: useSplit ? undefined : input.bagType === 'B' ? input.bigRate : input.smallRate,
    rentMonths: 1,
  });
}

/**
 * Period charge plus the effective per-bag rate actually charged (weighted
 * average across the snapshot for S+B splits). Canonical home for the
 * effective-rate derivation so services never divide outside contracts.
 */
export function resolvePeriodEffectiveRate(input: {
  period: ExtensionPeriod;
  bagType: BagType | null | undefined;
  snapshotSmallBags: number;
  snapshotBigBags: number;
  smallRate: number;
  bigRate: number;
}): { calculatedAmount: number; bagRate: number } {
  const calculatedAmount = calculatePeriodRent(input);
  const total = input.snapshotSmallBags + input.snapshotBigBags;
  return { calculatedAmount, bagRate: total > 0 ? Number((calculatedAmount / total).toFixed(2)) : 0 };
}
