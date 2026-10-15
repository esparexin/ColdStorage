import { z } from 'zod';
import { paymentModeSchema } from './rent.js';
import { outwardBagCategorySchema } from './delivery.js';
import { bagPriceSchema } from './pricing.js';

export const internalMovementTypeSchema = z.enum(['MERGE', 'TRANSFER_OWNERSHIP']);
export type InternalMovementType = z.infer<typeof internalMovementTypeSchema>;

export const partialMoveSchema = z.object({
  sourceGrnId: z.string().trim().min(1),
  smallBags: z.number().int().min(0).max(100000),
  bigBags: z.number().int().min(0).max(100000),
}).refine((d) => d.smallBags + d.bigBags > 0, 'Partial move must move at least one bag');

export type PartialMove = z.infer<typeof partialMoveSchema>;

export const mergeGrnInputSchema = z.object({
  targetGrnId: z.string().trim().min(1, 'Target GRN ID is required'),
  sourceGrnIds: z.array(z.string().trim().min(1)).min(1, 'At least one source GRN is required'),
  movementDate: z.coerce.date().default(() => new Date()),
  additionalRentAmount: z.number().min(0).default(0),
  remarks: z.string().trim().min(3, 'Remarks must be at least 3 characters').max(500),
  repackedSmallBags: z.number().int().min(0).nullish(),
  repackedBigBags: z.number().int().min(0).nullish(),
  // Source bag-category confirmation: reuses the outward vocabulary
  // (Small, Big, Small & Big, Hybrid/Mixed). Informational for rent — the
  // backend recomputes obligations from source rules and never bills these.
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).max(100000).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
  referenceWeight: z.number().positive('Reference weight must be greater than zero').max(1000000).nullish(),
  sourcePaymentAmount: z.number().min(0, 'Payment amount cannot be negative').nullish(),
  sourcePaymentMode: paymentModeSchema.nullish(),
  partialMoves: z.array(partialMoveSchema).nullish(),
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
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).max(100000).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
  transferSmallBags: z.number().int().min(0).max(100000).nullish(),
  transferBigBags: z.number().int().min(0).max(100000).nullish(),
  newGrnNumber: z.string().trim().min(1).max(20).nullish(),
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
  sourceBagCategory: outwardBagCategorySchema.nullish(),
  sourceQuantity: z.number().int().min(0).nullish(),
  sourceBagPrice: bagPriceSchema.nullish(),
  sourceSeasonalBagPrice: bagPriceSchema.nullish(),
  sourceMonthlyBagPrice: bagPriceSchema.nullish(),
  // Legacy internal-movement hamali keys: repack hamali (repackHamaliBags/Rate/Charge
  // on the movement record) is written only when an explicit repacking occurs;
  // the carried-forward `hamaliCarried` and snapshot `hamaliAmount` are never
  // written and never returned. Retained as read-optional so old docs parse.
  hamaliBags: z.number().min(0).optional(),
  hamaliRate: z.number().min(0).nullish(),
  hamaliCharge: z.number().min(0).optional(),
  hamaliCarried: z.number().min(0).optional(),
  referenceWeight: z.number().positive().max(1000000).nullish(),
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
    // Legacy snapshot hamali: never written, never returned; read-optional for old docs.
    hamaliAmount: z.number().min(0).optional(),
  }),
  remarks: z.string().nullable().optional(),
  performedBy: z.string().min(1),
  createdAt: z.coerce.date(),
});
export type InternalMovementRecord = z.infer<typeof internalMovementRecordSchema>;
