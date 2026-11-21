import { z } from 'zod';

/**
 * Itemized delivery challan credited during a rent payment.
 * Used in consolidated rent payment receipts to show all partial outwards settled.
 */
export const creditedChallanItemSchema = z.object({
  challanNumber: z.string(),
  gpNumber: z.string().nullable().optional(),
  date: z.coerce.date(),
  bags: z.number().int().min(0),
  rentCharge: z.number().min(0),
  amountCredited: z.number().min(0),
  status: z.string().optional(),
});

export type CreditedChallanItem = z.infer<typeof creditedChallanItemSchema>;
