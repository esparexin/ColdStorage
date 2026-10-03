import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { rentTypeSchema } from './grn.js';
import { paymentModeSchema, paymentStatusSchema } from './rent.js';

/**
 * Query schema for document format.
 * Phase 9 strictly locks format to 'html' (browser-native print).
 * Any non-html format (e.g., pdf, docx) is rejected.
 */
export const documentFormatQuerySchema = z.object({
  format: z.enum(['html']).default('html'),
});

export type DocumentFormatQuery = z.infer<typeof documentFormatQuerySchema>;

/**
 * Organization header info injected from SystemSettings SSOT.
 */
export const organizationHeaderSchema = z.object({
  orgName: z.string().min(1),
  address: z.string().min(1),
  contact: z.string().min(1),
  gstin: z.string().nullish(),
  logoAssetId: z.string().nullish(),
  printFooter: z.string().default(''),
  timezone: z.string().default('Asia/Kolkata'),
});

export type OrganizationHeader = z.infer<typeof organizationHeaderSchema>;

/**
 * Facility warehouse sub-header info injected from FacilityModel.
 */
export const facilitySubHeaderSchema = z.object({
  facilityId: z.string(),
  facilityName: z.string(),
  facilityCode: z.string(),
  facilityAddress: z.string(),
});

export type FacilitySubHeader = z.infer<typeof facilitySubHeaderSchema>;

/**
 * 1. GRN Storage Document DTO
 */
export const grnDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  grnId: z.string(),
  grnNumber: z.string(),
  inwardReceiptNumber: z.string(),
  date: z.coerce.date(),
  customerName: z.string(),
  commodityName: z.string(),
  chamber: chamberTextSchema,
  bags: z.number().int().min(1),
  bagType: bagTypeSchema,
  rentType: rentTypeSchema,
  rentAmount: rentalAmountSchema,
  rentMonths: z.number().int().positive().nullable().optional(),
  nominalUnitWeight: z.number().positive().nullable().optional(),
  nominalTotalWeight: z.number().positive().nullable().optional(),
  actualWeight: z.number().positive().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  gpNumber: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  status: z.string(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type GrnDocumentDto = z.infer<typeof grnDocumentDtoSchema>;

/**
 * 2. Inward Receipt (Farmer Acknowledgement) DTO
 */
export const receiptDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  inwardReceiptNumber: z.string(),
  grnNumber: z.string(),
  date: z.coerce.date(),
  customerName: z.string(),
  commodityName: z.string(),
  chamber: chamberTextSchema,
  bags: z.number().int().min(1),
  bagType: bagTypeSchema,
  rentType: rentTypeSchema,
  rentAmount: rentalAmountSchema,
  rentMonths: z.number().int().positive().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type ReceiptDocumentDto = z.infer<typeof receiptDocumentDtoSchema>;

/**
 * 3. Delivery Challan Document DTO
 */
export const challanDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  challanNumber: z.string(),
  date: z.coerce.date(),
  grnNumber: z.string(),
  customerName: z.string(),
  commodityName: z.string(),
  chamber: chamberTextSchema,
  bags: z.number().int().min(1),
  vehicleNumber: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  issuedBy: z.string(),
  status: z.string(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type ChallanDocumentDto = z.infer<typeof challanDocumentDtoSchema>;

/**
 * 4. Rent Payment Receipt DTO.
 *
 * One schema serves both the authoritative committed receipt and the zero-write preview:
 * `isPreview` drives the watermark and notice banner in the template. This previously existed
 * as two near-identical schemas that had to be kept in sync by hand.
 */
export const rentReceiptDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  receiptNumber: z.string(),
  grnNumber: z.string(),
  inwardReceiptNumber: z.string().optional(),
  inwardDate: z.coerce.date().optional(),
  date: z.coerce.date(),
  customerName: z.string(),
  commodityName: z.string(),
  chamber: chamberTextSchema,
  bagType: bagTypeSchema.optional(),
  inwardBags: z.number().int().optional(),
  deliveredBags: z.number().int().optional(),
  remainingBags: z.number().int().optional(),
  bagPrice: z.number().nullable().optional(),
  smallBagPrice: z.number().nullable().optional(),
  bigBagPrice: z.number().nullable().optional(),
  rentType: rentTypeSchema.optional(),
  rentMonths: z.number().int().nullable().optional(),
  billingCyclePeriod: z.string().optional(),
  totalRentObligation: rentalAmountSchema,
  previousPaidAmount: rentalAmountSchema.optional(),
  amountPaid: rentalAmountSchema,
  paymentMode: paymentModeSchema,
  remainingBalance: rentalAmountSchema,
  paymentStatus: paymentStatusSchema,
  isPreview: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type RentReceiptDocumentDto = z.infer<typeof rentReceiptDocumentDtoSchema>;

/** Preview is the same document shape, flagged as uncommitted. */
export const rentReceiptPreviewDtoSchema = rentReceiptDocumentDtoSchema.extend({
  isPreview: z.literal(true),
});

export type RentReceiptPreviewDto = z.infer<typeof rentReceiptPreviewDtoSchema>;