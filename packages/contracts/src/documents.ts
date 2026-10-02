import { z } from 'zod';
import { bagTypeSchema } from './bags.js';

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
 * Position allocation item for GRN / Put-Away storage record.
 */
export const documentPositionItemSchema = z.object({
  positionCode: z.string(),
  bags: z.number().int().min(1),
});

export type DocumentPositionItem = z.infer<typeof documentPositionItemSchema>;

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
  customerMobile: z.string(),
  commodityName: z.string(),
  chamberNumber: z.string(),
  bags: z.number().int().min(1),
  bagType: bagTypeSchema,
  rentType: z.enum(['Monthly', 'Seasonal']),
  rentAmount: z.number().min(0),
  rentMonths: z.number().int().positive().nullable().optional(),
  nominalUnitWeight: z.number().positive().nullable().optional(),
  nominalTotalWeight: z.number().positive().nullable().optional(),
  actualWeight: z.number().positive().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  gpNumber: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  status: z.string(),
  positions: z.array(documentPositionItemSchema),
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
  customerMobile: z.string(),
  commodityName: z.string(),
  chamberNumber: z.string(),
  bags: z.number().int().min(1),
  bagType: bagTypeSchema,
  rentType: z.enum(['Monthly', 'Seasonal']),
  rentAmount: z.number().min(0),
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
  chamberNumber: z.string(),
  totalBags: z.number().int().min(1),
  items: z.array(documentPositionItemSchema),
  vehicleNumber: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  issuedBy: z.string(),
  status: z.string(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type ChallanDocumentDto = z.infer<typeof challanDocumentDtoSchema>;

/**
 * 4. Rent Payment Receipt Preview DTO (P9 Preview Template Only)
 */
export const rentReceiptPreviewDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  receiptNumber: z.string(),
  grnNumber: z.string(),
  date: z.coerce.date(),
  customerName: z.string(),
  customerMobile: z.string(),
  commodityName: z.string(),
  totalRentObligation: z.number().min(0),
  amountPaid: z.number().min(0),
  paymentMode: z.enum(['Cash', 'UPI']),
  remainingBalance: z.number().min(0),
  paymentStatus: z.enum(['Settled', 'Not Settled']),
  isPreview: z.literal(true),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type RentReceiptPreviewDto = z.infer<typeof rentReceiptPreviewDtoSchema>;

/**
 * 5. Rent Payment Receipt Document DTO (Phase 12 Authoritative Template)
 */
export const rentReceiptDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  receiptNumber: z.string(),
  grnNumber: z.string(),
  date: z.coerce.date(),
  customerName: z.string(),
  customerMobile: z.string(),
  commodityName: z.string(),
  totalRentObligation: z.number().min(0),
  amountPaid: z.number().min(0),
  paymentMode: z.enum(['Cash', 'UPI']),
  remainingBalance: z.number().min(0),
  paymentStatus: z.enum(['Settled', 'Not Settled']),
  notes: z.string().nullable().optional(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type RentReceiptDocumentDto = z.infer<typeof rentReceiptDocumentDtoSchema>;
