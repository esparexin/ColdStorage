import { z } from 'zod';

/**
 * Single canonical bag model (P0-Decision 3 & 4).
 * - Bag Type: strictly controlled vocabulary of 'S', 'B', or 'S+B'.
 * - Captures nominal weight and actual/weighbridge weight.
 * - Actual/weighbridge weight is authoritative when provided.
 * - Weight unit remains PENDING CONFIRMATION.
 */
export const bagTypeSchema = z.enum(['S', 'B', 'S+B']);
export type BagType = z.infer<typeof bagTypeSchema>;

export const bagAccountingSchema = z.object({
  bagType: bagTypeSchema,
  bags: z.number().int().positive().max(100000),
  nominalUnitWeight: z.number().positive().nullish(),
  nominalTotalWeight: z.number().positive().nullish(),
  actualWeight: z.number().positive().nullish(),
});

export type BagAccounting = z.infer<typeof bagAccountingSchema>;

/**
 * Derives the authoritative weight from bag accounting:
 * Weighbridge actual weight is authoritative; falls back to nominal total weight if actual is absent.
 */
export function getAuthoritativeWeight(accounting: BagAccounting): number | null {
  return accounting.actualWeight ?? accounting.nominalTotalWeight ?? null;
}
