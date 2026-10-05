import { z } from 'zod';
import {
  bagCompositionConsistent,
  bagCompositionIssueMessage,
  bagTypeSchema,
  perBagWeightSchema,
} from './bags.js';
import { chamberTextSchema, indianVehicleSchema, rentalAmountSchema } from './common.js';
import { bondNumberSchema, gpNumberSchema, grnNumberSchema, receiptNumberSchema } from './identifiers.js';
import { bagPriceSchema } from './pricing.js';

export const rentTypeSchema = z.enum(['Monthly', 'Seasonal']);
export type RentType = z.infer<typeof rentTypeSchema>;

// Complete 10-month rental period business constant for Seasonal subscriptions.
export const SEASONAL_RENT_MONTHS = 10;
export function rentMonthsForType(rentType: RentType): number | null {
  return rentType === 'Seasonal' ? SEASONAL_RENT_MONTHS : null;
}
/** Operator-facing month input: Monthly requires an explicit count; Seasonal is fixed. */
export const rentMonthsInputSchema = z
  .number({ invalid_type_error: 'Rent months must be a number' })
  .int('Rent months must be a whole number')
  .min(1, 'Rent months must be at least 1');

import {
  loanPaymentModeSchema,
  updateGrnLoanStatusSchema,
  type UpdateGrnLoanStatusInput,
} from './loan.js';

export const grnStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type GrnStatus = z.infer<typeof grnStatusSchema>;

export const loanStatusSchema = z.enum(['NONE', 'NOT_TAKEN', 'TAKEN', 'CLEARED']);
export type LoanStatus = z.infer<typeof loanStatusSchema>;

export { updateGrnLoanStatusSchema, type UpdateGrnLoanStatusInput };

export const inwardReceiptNumberSchema = receiptNumberSchema;
export type InwardReceiptNumber = z.infer<typeof inwardReceiptNumberSchema>;

export const createGrnSchema = z
  .object({
    date: z.coerce.date().default(() => new Date()),
    customerId: z.string().trim().min(1),
    commodityId: z.string().trim().min(1),
    chamber: chamberTextSchema,
    bags: z.number().int().positive().max(100000),
    bagType: bagTypeSchema,
    /**
     * Per-bag weight only (kg per individual bag).
     * - S requires smallBagWeight; B requires bigBagWeight; S+B requires both.
     * - No nominal / weighbridge / total-weight fields exist.
     */
    smallBagWeight: perBagWeightSchema.nullish(),
    bigBagWeight: perBagWeightSchema.nullish(),
    rentType: rentTypeSchema,
    /**
     * Rent Months is informational only. It does not determine, modify, or finalize
     * the monthly subscription/payment logic, which is finalized independently per
     * the applicable subscription/rent rules (see pricing.calculateRentAmount).
     */
    rentMonths: rentMonthsInputSchema.nullish(),
    rentAmount: rentalAmountSchema.nullish(),
    bagPrice: bagPriceSchema.nullish(),
    smallBags: z.number().int().min(0).nullish(),
    bigBags: z.number().int().min(0).nullish(),
    smallBagPrice: bagPriceSchema.nullish(),
    bigBagPrice: bagPriceSchema.nullish(),
    gpNumber: gpNumberSchema,
    storageMark: z.string().trim().max(20, 'Storage mark cannot exceed 20 characters').nullish(),
    partyMark: z.string().trim().max(20, 'Party mark cannot exceed 20 characters').nullish(),
    marks: z.string().trim().max(100).nullish(),
    billNumber: z.string().trim().min(1).max(40).nullish(),
    vehicleNumber: indianVehicleSchema.nullish(),
    remarks: z.string().trim().max(500).nullish(),
    bondNumber: bondNumberSchema.nullish(),
    isBondForLoan: z.boolean().nullish(),
    loanStatus: loanStatusSchema.nullish(),
    loanBankName: z.string().trim().max(100).nullish(),
    loanReferenceNumber: z.string().trim().max(50).nullish(),
    loanRemarks: z.string().trim().max(500).nullish(),
  })
  .refine(
    (data) => {
      if (data.rentType === 'Monthly') {
        return typeof data.rentMonths === 'number' && data.rentMonths >= 1;
      }
      return data.rentMonths === null || data.rentMonths === undefined;
    },
    {
      message: "rentMonths (>= 1) is required for 'Monthly' rent and must be omitted for 'Seasonal'",
      path: ['rentMonths'],
    },
  )
  .refine(
    (data) => {
      if (data.bagType === 'S' || data.bagType === 'S+B') {
        if (typeof data.smallBagWeight !== 'number' || data.smallBagWeight <= 0) return false;
      }
      if (data.bagType === 'B' || data.bagType === 'S+B') {
        if (typeof data.bigBagWeight !== 'number' || data.bigBagWeight <= 0) return false;
      }
      return true;
    },
    { message: 'Per-bag weight is required: Small Bag Weight for S, Big Bag Weight for B, both for S+B', path: ['smallBagWeight'] },
  )
  .refine(
    (data) =>
      // The stored composition and the stored total are the same fact. Rejecting an inconsistent
      // declaration here is what stops `bags` and its parts from drifting apart in the database.
      bagCompositionConsistent({
        bagType: data.bagType,
        bags: data.bags,
        smallBags: data.smallBags,
        bigBags: data.bigBags,
      }),
    {
      message: bagCompositionIssueMessage,
      path: ['smallBags'],
    },
  )
  .refine(
    (data) => {
      // Future date check with 5 min tolerance
      const maxAllowed = new Date(Date.now() + 5 * 60 * 1000);
      return data.date <= maxAllowed;
    },
    {
      message: 'Inward date cannot be in the future',
      path: ['date'],
    },
  );

export type CreateGrnInput = z.infer<typeof createGrnSchema>;

export const grnSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: grnNumberSchema,
  inwardReceiptNumber: inwardReceiptNumberSchema,
  billNumber: z.string().nullable().optional(),
  date: z.date(),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  commodityId: z.string().min(1),
  commodityName: z.string().min(1),
  chamber: chamberTextSchema,
  bags: z.number().int().positive(),
  bagType: bagTypeSchema,
  smallBagWeight: z.number().positive().nullable().optional(),
  bigBagWeight: z.number().positive().nullable().optional(),
  rentType: rentTypeSchema,
  /** Informational only; monthly subscription/rent is finalized per subscription/rent rules. */
  rentMonths: z.number().int().nullable().optional(),
  rentAmount: rentalAmountSchema,
  bagPrice: z.number().nullable().optional(),
  smallBagPrice: z.number().nullable().optional(),
  bigBagPrice: z.number().nullable().optional(),
  /** Always present: a single-type receipt stores zero on the unused side rather than null. */
  smallBags: z.number().int().min(0),
  bigBags: z.number().int().min(0),
  gpNumber: z.string().nullable().optional(),
  storageMark: z.string().nullable().optional(),
  partyMark: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: grnStatusSchema,
  bondNumber: z.string().nullable().optional().default(null),
  isBondForLoan: z.boolean().default(false),
  loanStatus: loanStatusSchema.default('NONE'),
  loanBankName: z.string().nullable().optional(),
  loanReferenceNumber: z.string().nullable().optional(),
  loanRemarks: z.string().nullable().optional(),
  loanTakenAt: z.date().nullable().optional(),
  loanClearedAt: z.date().nullable().optional(),
  loanSettlementAmount: z.number().nullable().optional(),
  loanSettlementMode: loanPaymentModeSchema.nullable().optional(),
  loanSettlementUtr: z.string().nullable().optional(),
  loanSettlementBankName: z.string().nullable().optional(),
  loanSettlementAccountNumber: z.string().nullable().optional(),
  loanSettlementIfsc: z.string().nullable().optional(),
  loanSettlementReceiverName: z.string().nullable().optional(),
  loanSettlementReceiverAadhaar: z.string().nullable().optional(),
  netDeliveredBags: z.number().int().min(0).optional(),
  closingBags: z.number().int().min(0).optional(),
  createdBy: z.string().min(1),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Grn = z.infer<typeof grnSchema>;

/**
 * Authorized correction of an inward receipt.
 *
 * Only the operational facts of a receipt may be corrected: what was stored, how many bags, and
 * which chamber it went into. This is the approved correction workflow required by the
 * architecture lock's transaction-immutability rule — it is not a chamber transfer feature, and
 * it refuses to run once stock has moved so the ledger and the receipt cannot diverge.
 *
 * Financial and identity terms (rent, customer, dates, numbering) are deliberately NOT
 * correctable; those require the reversal workflows.
 */
export const correctGrnSchema = z
  .object({
    commodityId: z.string().trim().min(1, 'commodityId is required').optional(),
    bags: z.number().int().positive('bags must be a positive integer').max(100000).optional(),
    /**
     * The corrected split, required together when a mixed receipt's total changes. A single-type
     * receipt's composition is derived from its bag type, so it takes no split.
     */
    smallBags: z.number().int().min(0).max(100000).optional(),
    bigBags: z.number().int().min(0).max(100000).optional(),
    chamber: chamberTextSchema.optional(),
    reason: z.string().trim().min(5, 'A correction reason of at least 5 characters is required').max(500),
  })
  .strict()
  .refine(
    (data) =>
      data.commodityId !== undefined ||
      data.bags !== undefined ||
      data.chamber !== undefined ||
      data.smallBags !== undefined ||
      data.bigBags !== undefined,
    {
      message: 'Provide at least one of commodityId, bags, smallBags, bigBags or chamber to correct',
      path: ['chamber'],
    },
  )
  .refine(
    (data) =>
      (data.smallBags === undefined && data.bigBags === undefined) ||
      (data.smallBags !== undefined && data.bigBags !== undefined),
    {
      message: 'smallBags and bigBags must be corrected together',
      path: ['smallBags'],
    },
  );

export type CorrectGrnInput = z.infer<typeof correctGrnSchema>;
