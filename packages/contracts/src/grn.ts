import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { indianVehicleSchema } from './common.js';
import { gpNumberSchema, grnNumberSchema, receiptNumberSchema } from './identifiers.js';

export const rentTypeSchema = z.enum(['Monthly', 'Seasonal']);
export type RentType = z.infer<typeof rentTypeSchema>;

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
    chamberId: z.string().trim().min(1),
    bags: z.number().int().positive().max(100000),
    bagType: bagTypeSchema,
    nominalUnitWeight: z.number().positive().nullish(),
    nominalTotalWeight: z.number().positive().nullish(),
    actualWeight: z.number().positive().nullish(),
    rentType: rentTypeSchema,
    rentMonths: z.number().int().min(1).nullish(),
    rentAmount: z.number().min(0),
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
      message: "rentMonths is required (>= 1) for 'Monthly' rent and must be null for 'Seasonal'",
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
  chamberId: z.string().min(1),
  chamberNumber: z.string().min(1),
  bags: z.number().int().positive(),
  bagType: bagTypeSchema,
  nominalUnitWeight: z.number().nullable().optional(),
  nominalTotalWeight: z.number().nullable().optional(),
  actualWeight: z.number().nullable().optional(),
  authoritativeWeight: z.number().nullable().optional(),
  rentType: rentTypeSchema,
  rentMonths: z.number().nullable().optional(),
  rentAmount: z.number().min(0),
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
    chamberId: z.string().min(1),
    chamberNumber: z.string().min(1),
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
    rentMonths: z.number().nullable().optional(),
    rentAmount: z.number().min(0),
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
  chamberId: z.string().optional(),
  status: grnStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GrnQuery = z.infer<typeof grnQuerySchema>;
