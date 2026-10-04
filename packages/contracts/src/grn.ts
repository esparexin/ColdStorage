import { z } from 'zod';
import { bagTypeSchema, perBagWeightSchema } from './bags.js';
import { chamberTextSchema, indianVehicleSchema, rentalAmountSchema } from './common.js';
import { gpNumberSchema, grnNumberSchema, receiptNumberSchema } from './identifiers.js';
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

export const grnStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type GrnStatus = z.infer<typeof grnStatusSchema>;

export const inwardReceiptNumberSchema = receiptNumberSchema;
export type InwardReceiptNumber = z.infer<typeof inwardReceiptNumberSchema>;

/** Calculates Indian Financial Year string from a date in Asia/Kolkata (IST). Starts April 1. */
export function getFinancialYearKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(date));
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? String(new Date(date).getFullYear()), 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? String(new Date(date).getMonth() + 1), 10);
  const startYear = month < 4 ? year - 1 : year;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

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
  smallBags: z.number().int().nullable().optional(),
  bigBags: z.number().int().nullable().optional(),
  gpNumber: z.string().nullable().optional(),
  storageMark: z.string().nullable().optional(),
  partyMark: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: grnStatusSchema,
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
    chamber: chamberTextSchema.optional(),
    reason: z.string().trim().min(5, 'A correction reason of at least 5 characters is required').max(500),
  })
  .strict()
  .refine(
    (data) => data.commodityId !== undefined || data.bags !== undefined || data.chamber !== undefined,
    {
      message: 'Provide at least one of commodityId, bags or chamber to correct',
      path: ['chamber'],
    },
  );

export type CorrectGrnInput = z.infer<typeof correctGrnSchema>;

export const grnAcknowledgementSchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: grnNumberSchema,
  inwardReceiptNumber: inwardReceiptNumberSchema,
  inwardDate: z.date(),
  customer: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  commodity: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  storageLocation: z.object({
    chamber: chamberTextSchema,
  }),
  bagAccounting: z.object({
    bags: z.number().int().positive(),
    bagType: bagTypeSchema,
    bagPrice: z.number().nullable().optional(),
    smallBagPrice: z.number().nullable().optional(),
    bigBagPrice: z.number().nullable().optional(),
    smallBags: z.number().int().nullable().optional(),
    bigBags: z.number().int().nullable().optional(),
    smallBagWeight: z.number().positive().nullable().optional(),
    bigBagWeight: z.number().positive().nullable().optional(),
  }),
  rentTerms: z.object({
    rentType: rentTypeSchema,
    /** Informational only; not used to finalize monthly subscription/payment. */
    rentMonths: z.number().int().nullable().optional(),
    rentAmount: rentalAmountSchema,
  }),
  transport: z.object({
    gpNumber: z.string().nullable().optional(),
    storageMark: z.string().nullable().optional(),
    partyMark: z.string().nullable().optional(),
    marks: z.string().nullable().optional(),
    vehicleNumber: z.string().nullable().optional(),
  }),
  remarks: z.string().nullable().optional(),
  status: grnStatusSchema,
  issuedBy: z.string().min(1),
  issuedAt: z.date(),
});

export type GrnAcknowledgement = z.infer<typeof grnAcknowledgementSchema>;

export const grnQuerySchema = z.object({
  customerId: z.string().optional(),
  commodityId: z.string().optional(),
  chamber: z.string().trim().max(20).optional(),
  status: grnStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GrnQuery = z.infer<typeof grnQuerySchema>;
