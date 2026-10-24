import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { paymentModeSchema } from './rent.js';
import { outwardBagCategorySchema } from './delivery.js';
import { bagPriceSchema } from './pricing.js';

export const internalMovementTypeSchema = z.enum(['MERGE', 'TRANSFER_OWNERSHIP']);
export type InternalMovementType = z.infer<typeof internalMovementTypeSchema>;

export const mergeGrnInputSchema = z.object({
  targetGrnId: z.string().trim().min(1, 'Target GRN ID is required'),
  sourceGrnIds: z.array(z.string().trim().min(1)).min(1, 'At least one source GRN is required'),
  movementDate: z.coerce.date().default(() => new Date()),
  /**
   * Optional manual override for carried rent obligation. When omitted or 0,
   * the cumulative source pending rent is automatically calculated and carried forward.
   */
  additionalRentAmount: z.number().min(0).default(0),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
  isRepackSelected: z.boolean().optional(),
  repackedSmallBags: z.number().int().min(0).nullish(),
  repackedBigBags: z.number().int().min(0).nullish(),
  repackedBagCount: z.number().int().min(0).max(100000).nullish(),
  // Source bag type / category confirmation: canonical bagType ('S', 'B', 'S+B', 'S/B', 'Hybrid')
  // or legacy category. Informational for rent — backend recomputes obligations.
  sourceBagType: bagTypeSchema.nullish(),
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).max(100000).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
  referenceWeight: z.number().positive('Reference weight must be greater than zero').max(1000000).nullish(),
  sourcePaymentAmount: z.number().min(0, 'Payment amount cannot be negative').nullish(),
  sourcePaymentMode: paymentModeSchema.nullish(),
  /** Idempotency key for safe retries. Same key returns the existing movement result. */
  idempotencyKey: z.string().trim().min(1).max(100).nullish(),
});
export type MergeGrnInput = z.infer<typeof mergeGrnInputSchema>;

export const transferPaymentDecisionSchema = z.enum(['SETTLE_NOW', 'AGREED_PENDING']);
export type TransferPaymentDecision = z.infer<typeof transferPaymentDecisionSchema>;

export const transferSettlementDetailsSchema = z.object({
  amountPaid: z.number().positive('Payment amount must be greater than zero'),
  paymentMode: paymentModeSchema,
  paymentNotes: z.string().trim().max(500).nullish(),
});
export type TransferSettlementDetails = z.infer<typeof transferSettlementDetailsSchema>;

export const transferOwnershipInputSchema = z.object({
  grnId: z.string().trim().min(1, 'GRN ID is required'),
  newCustomerId: z.string().trim().min(1, 'New Customer ID is required'),
  movementDate: z.coerce.date().default(() => new Date()),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
  paymentDecision: transferPaymentDecisionSchema.optional(),
  settlementDetails: transferSettlementDetailsSchema.optional(),
  /** Explicit confirmation required when stored composition is unverified. */
  confirmedSmallBags: z.number().int().min(0).max(100000).nullish(),
  confirmedBigBags: z.number().int().min(0).max(100000).nullish(),
  sourceBagType: bagTypeSchema.nullish(),
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).max(100000).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;

export const internalMovementRecordSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  movementType: internalMovementTypeSchema,
  movementDate: z.coerce.date(),
  targetGrnId: z.string().nullable().optional(),
  targetGrnNumber: z.string().nullable().optional(),
  sourceGrnIds: z.array(z.string()).default([]),
  sourceGrnNumbers: z.array(z.string()).default([]),
  totalBagsMoved: z.number().min(0).default(0),
  smallBagsMoved: z.number().min(0).default(0),
  bigBagsMoved: z.number().min(0).default(0),
  // Informational confirmation echo (challan-column mirror): never billed,
  // read-optional so pre-change documents still parse.
  sourceBagType: bagTypeSchema.nullish(),
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
  // Internal-movement hamali: repacking labor (repackHamaliBags/Rate/Charge on movement
  // record, mirrored into financialSnapshot.hamaliAmount) is written when repacking
  // hamali applies (hamaliCharge > 0); legacy hamaliCarried is unwritten.
  hamaliBags: z.number().min(0).optional(),
  hamaliRate: z.number().min(0).nullish(),
  hamaliCharge: z.number().min(0).optional(),
  /** @deprecated Legacy column: retained for historical document reads; never written. */
  hamaliCarried: z.number().min(0).optional(),
  referenceWeight: z.number().positive().max(1000000).nullish(),
  idempotencyKey: z.string().trim().min(1).max(100).nullish(),
  grnId: z.string().nullable().optional(),
  grnNumber: z.string().nullable().optional(),
  fromCustomerId: z.string().nullable().optional(),
  fromCustomerName: z.string().nullable().optional(),
  toCustomerId: z.string().nullable().optional(),
  toCustomerName: z.string().nullable().optional(),
  financialSnapshot: z.object({
    rentAmount: z.number().min(0),
    totalPaid: z.number().min(0),
    remainingBalance: z.number().min(0),
    paymentStatus: z.string(),
    rentState: z.string().optional(),
    // Repacking hamali labor charge snapshot (written when hamaliCharge > 0).
    hamaliAmount: z.number().min(0).optional(),
  }),
  remarks: z.string().nullable().optional(),
  performedBy: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type InternalMovementRecord = z.infer<typeof internalMovementRecordSchema>;

export const HYBRID_RATE_REQUIRED_MESSAGE =
  'Confirmed Hybrid lots require a per-bag rate (Each Bag Price, or Seasonal/Monthly rates).';

export interface HybridRateInputs {
  bagPrice?: number | null | '';
  seasonalBagPrice?: number | null | '';
  monthlyBagPrice?: number | null | '';
}

/** Pure helper to check if at least one positive Hybrid rate is configured. */
export function hasPositiveHybridRate(rates: HybridRateInputs): boolean {
  return (
    (typeof rates.bagPrice === 'number' && rates.bagPrice > 0) ||
    (typeof rates.seasonalBagPrice === 'number' && rates.seasonalBagPrice > 0) ||
    (typeof rates.monthlyBagPrice === 'number' && rates.monthlyBagPrice > 0)
  );
}

/** Pure helper to validate confirmed Hybrid quantity against available/moved stock. */
export function validateHybridQuantityInput(
  quantity: number | null | undefined | '',
  expectedTotal: number,
  stockNoun: 'total moved stock' | 'available stock' = 'available stock',
): string | null {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return 'Confirmed Hybrid quantity must be a positive whole number.';
  }
  if (quantity !== expectedTotal) {
    return `Confirmed Hybrid quantity (${quantity}) must match ${stockNoun} of ${expectedTotal} bags.`;
  }
  return null;
}

/**
 * Appends an audit note to GRN remarks without exceeding the 500-char max constraint.
 * If the resulting combined string exceeds maxLen (default 500), it safely trims the
 * earliest text so the latest audit note and total length remain strictly within bounds.
 */
export function appendGrnRemarks(existing: string | null | undefined, newNote: string, maxLen = 500): string {
  const note = newNote.trim();
  if (!existing?.trim()) return note.slice(0, maxLen);
  const combined = `${existing.trim()}\n${note}`;
  if (combined.length <= maxLen) return combined;
  if (note.length >= maxLen) return note.slice(0, maxLen);
  return combined.slice(combined.length - maxLen);
}

