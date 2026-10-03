import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, indianVehicleSchema, rentalAmountSchema } from './common.js';
import { gpNumberSchema, grnNumberSchema, receiptNumberSchema } from './identifiers.js';

export const rentTypeSchema = z.enum(['Monthly', 'Seasonal']);
export type RentType = z.infer<typeof rentTypeSchema>;

/**
 * A Seasonal subscription is the complete 10-month rental period. The month count is a fixed
 * business constant, not operator input, so it is derived here rather than accepted from a
 * caller that could disagree with this SSOT.
 */
export const SEASONAL_RENT_MONTHS = 10;

/** Single derivation point for the rental period implied by a rent type. */
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

/**
 * Calculates Indian Financial Year string from a date in Asia/Kolkata (IST).
 * Financial Year starts on April 1.
 * e.g., Oct 2026 -> "26-27", Jan 2027 -> "26-27".
 */
export function getFinancialYearKey(date: Date): string {
  // Use Intl.DateTimeFormat to reliably extract year and month in Asia/Kolkata timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(new Date(date));
  const yearPart = parts.find((p) => p.type === 'year')?.value;
  const monthPart = parts.find((p) => p.type === 'month')?.value;

  const year = parseInt(yearPart ?? String(new Date(date).getFullYear()), 10);
  const month = parseInt(monthPart ?? String(new Date(date).getMonth() + 1), 10);

  let startYear = year;
  let endYear = year + 1;

  if (month < 4) {
    startYear = year - 1;
    endYear = year;
  }

  const startShort = String(startYear).slice(-2);
  const endShort = String(endYear).slice(-2);
  return `${startShort}-${endShort}`;
}

export const createGrnSchema = z
  .object({
    date: z.coerce.date().default(() => new Date()),
    customerId: z.string().trim().min(1),
    commodityId: z.string().trim().min(1),
    chamber: chamberTextSchema,
    bags: z.number().int().positive().max(100000),
    bagType: bagTypeSchema,
    nominalUnitWeight: z.number().positive().nullish(),
    nominalTotalWeight: z.number().positive().nullish(),
    actualWeight: z.number().positive().nullish(),
    rentType: rentTypeSchema,
    rentMonths: rentMonthsInputSchema.nullish(),
    rentAmount: rentalAmountSchema,
    gpNumber: gpNumberSchema,
    marks: z.string().trim().max(100).nullish(),
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
  date: z.date(),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  commodityId: z.string().min(1),
  commodityName: z.string().min(1),
  chamber: chamberTextSchema,
  bags: z.number().int().positive(),
  bagType: bagTypeSchema,
  nominalUnitWeight: z.number().nullable().optional(),
  nominalTotalWeight: z.number().nullable().optional(),
  actualWeight: z.number().nullable().optional(),
  authoritativeWeight: z.number().nullable().optional(),
  rentType: rentTypeSchema,
  rentMonths: z.number().int().nullable().optional(),
  rentAmount: rentalAmountSchema,
  gpNumber: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: grnStatusSchema,
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
    nominalUnitWeight: z.number().nullable().optional(),
    nominalTotalWeight: z.number().nullable().optional(),
    actualWeight: z.number().nullable().optional(),
    authoritativeWeight: z.number().nullable().optional(),
  }),
  rentTerms: z.object({
    rentType: rentTypeSchema,
    rentMonths: z.number().int().nullable().optional(),
    rentAmount: rentalAmountSchema,
  }),
  transport: z.object({
    gpNumber: z.string().nullable().optional(),
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
