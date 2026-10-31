import { z } from 'zod';
import { operationalBagTypeSchema } from './bags.js';
import { paymentModeSchema, rentPaymentSchema } from './rent.js';
import { grnSchema } from './grn.js';
import { internalMovementRecordSchema } from './internal-movement.js';
import { chamberTextSchema } from './common.js';

/**
 * Step 1: Confirmation and Rent/Bill Generation Input for Sorting.
 * Confirms existing lot identity, recalculates rent, and generates bill before repacking.
 */
export const sortGrnInputSchema = z
  .object({
    grnId: z.string().trim().min(1, 'GRN ID is required'),
    confirmedBagType: operationalBagTypeSchema,
    confirmedBags: z.number().int().positive('Confirmed bags must be greater than zero'),
    /** Optional confirmed small bags count for S/B composition. */
    confirmedSmallBags: z.number().int().min(0).nullish(),
    /** Optional confirmed big bags count for S/B composition. */
    confirmedBigBags: z.number().int().min(0).nullish(),
    /** Optional confirmed total bags weight (kg). */
    totalBagsWeight: z.number().positive('Total bags weight must be positive').nullish(),
    paymentMode: paymentModeSchema.default('Cash'),
    paymentNotes: z.string().trim().max(250).nullish(),
    idempotencyKey: z.string().trim().min(1).max(100).nullish(),
  })
  .refine(
    (data) => {
      if (
        data.confirmedBagType === 'S/B' &&
        (data.confirmedSmallBags != null || data.confirmedBigBags != null)
      ) {
        const small = data.confirmedSmallBags ?? 0;
        const big = data.confirmedBigBags ?? 0;
        return small + big === data.confirmedBags;
      }
      return true;
    },
    {
      message: 'Sum of confirmed small and big bags must match confirmed total bags',
      path: ['confirmedBags'],
    },
  );
export type SortGrnInput = z.infer<typeof sortGrnInputSchema>;

export const sortGrnResultSchema = z.object({
  grn: grnSchema,
  payment: rentPaymentSchema.optional(),
  receiptNumber: z.string().optional(),
  billedAmount: z.number(),
  isSortingComplete: z.boolean(),
});
export type SortGrnResult = z.infer<typeof sortGrnResultSchema>;

/**
 * Step 2: Physical Bag-Conversion Input for Repacking/Rebagging.
 * Unlocked only after successful sorting and rent bill generation.
 */
export const repackGrnInputSchema = z.object({
  grnId: z.string().trim().min(1, 'GRN ID is required'),
  resultingBagType: operationalBagTypeSchema,
  destinationChamber: chamberTextSchema.nullish(),
  repackedSmallBags: z.number().int().min(0).nullish(),
  repackedBigBags: z.number().int().min(0).nullish(),
  repackedQuantity: z.number().int().min(0).nullish(),
  referenceWeight: z.number().positive('Reference weight must be greater than zero').nullish(),
  repackVarianceReason: z.string().trim().max(500).nullish(),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
  idempotencyKey: z.string().trim().min(1).max(100).nullish(),
});
export type RepackGrnInput = z.infer<typeof repackGrnInputSchema>;

export const repackGrnResultSchema = z.object({
  grn: grnSchema,
  movement: internalMovementRecordSchema,
  repackVariance: z.number().int(),
  hamaliCharge: z.number(),
});
export type RepackGrnResult = z.infer<typeof repackGrnResultSchema>;
