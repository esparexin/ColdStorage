import { z } from 'zod';
import {
  bagCompositionConsistent,
  bagCompositionIssueMessage,
  bagTypeSchema,
  perBagWeightSchema,
} from './bags.js';
import { chamberTextSchema, indianVehicleSchema, rentalAmountSchema } from './common.js';
import {
  bondNumberSchema,
  gpNumberSchema,
  grnNumberInputSchema,
  grnNumberSchema,
  receiptNumberSchema,
} from './identifiers.js';
import { bagPriceSchema } from './pricing.js';
import {
  rentMonthsForType,
  rentMonthsInputSchema,
  rentTypeSchema,
  SEASONAL_RENT_MONTHS,
} from './grn-rent.js';

export { rentMonthsForType, rentMonthsInputSchema, rentTypeSchema, SEASONAL_RENT_MONTHS };
export type { RentType } from './grn-rent.js';
export { correctGrnSchema, type CorrectGrnInput } from './grn-correction.js';

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

/**
 * GR Number is entered manually as exactly four digits and is the sole business key for the
 * goods lifecycle; uniqueness within the facility is enforced server-side (see grnNumberInputSchema).
 */
export const createGrnSchema = z
  .object({
    grnNumber: grnNumberInputSchema,
    date: z.coerce.date().default(() => new Date()),
    customerId: z.string().trim().min(1),
    commodityId: z.string().trim().min(1),
    chamber: chamberTextSchema,
    bags: z.number().int().positive().max(100000),
    bagType: bagTypeSchema,
    /** Per-bag weight only (kg per individual bag); optional. No nominal/weighbridge/total. */
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
      if (data.rentType === 'Seasonal') {
        return data.rentMonths === null || data.rentMonths === undefined;
      }
      return (
        data.rentMonths === null ||
        data.rentMonths === undefined ||
        (typeof data.rentMonths === 'number' && data.rentMonths >= 1)
      );
    },
    {
      message: "rentMonths must be omitted for 'Seasonal' rent",
      path: ['rentMonths'],
    },
  )
  .refine(
    (data) => {
      // Per-bag weight is optional: the Inward form captures Total Bags and a single Bag Price.
      // When a weight is supplied it must still be a positive number.
      if (data.smallBagWeight != null && data.smallBagWeight <= 0) return false;
      if (data.bigBagWeight != null && data.bigBagWeight <= 0) return false;
      return true;
    },
    { message: 'Per-bag weight must be a positive number when provided', path: ['smallBagWeight'] },
  )
  .refine(
    (data) =>
      // The stored composition and the stored total are the same fact. A receipt either declares
      // an explicit split (legacy CSV import) or none at all, in which case the split is derived
      // from the bag type and the total. Rejecting an inconsistent declaration is what stops
      // `bags` and its parts from drifting apart in the database.
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


