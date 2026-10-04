import { z } from 'zod';

/**
 * Single canonical bag model (P0-Decision 3 & 4).
 * - Bag Type: strictly controlled vocabulary of 'S', 'B', or 'S+B'.
 * - Weight is captured per individual bag only (Small Bag Weight / Big Bag Weight).
 * - No nominal/weighbridge/total-weight concepts exist in the GRN workflow.
 */
export const bagTypeSchema = z.enum(['S', 'B', 'S+B']);
export type BagType = z.infer<typeof bagTypeSchema>;

/** Per-bag weight in kg for one individual bag of the respective type. */
export const perBagWeightSchema = z
  .number({ invalid_type_error: 'Bag weight must be a number' })
  .positive('Bag weight must be greater than zero')
  .max(1000, 'Bag weight cannot exceed 1,000 kg');

export const bagAccountingSchema = z.object({
  bagType: bagTypeSchema,
  bags: z.number().int().positive().max(100000),
  smallBagWeight: perBagWeightSchema.nullish(),
  bigBagWeight: perBagWeightSchema.nullish(),
});

export type BagAccounting = z.infer<typeof bagAccountingSchema>;
