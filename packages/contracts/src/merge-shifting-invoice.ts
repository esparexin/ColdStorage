import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { facilitySubHeaderSchema, organizationHeaderSchema } from './documents.js';

export const mergeSourceLotSummarySchema = z.object({
  grnId: z.string(),
  grnNumber: z.string(),
  customerName: z.string(),
  originalChamber: chamberTextSchema,
  movedBags: z.number().int().min(1),
  smallBags: z.number().int().min(0),
  bigBags: z.number().int().min(0),
  bagType: bagTypeSchema,
  pendingRentSettled: rentalAmountSchema.default(0),
});

export type MergeSourceLotSummary = z.infer<typeof mergeSourceLotSummarySchema>;

/**
 * Consignment Merge & Internal Shifting Invoice & Challan DTO (canonical MSH-INV format).
 * Represents official warehouse consolidation, extinguishing source lots, surviving target lot putaway,
 * and internal chamber shifting certification.
 */
export const mergeShiftingInvoiceDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  mergeInvoiceNumber: z.string(),
  movementDate: z.coerce.date(),
  targetGrnId: z.string(),
  targetGrnNumber: z.string(),
  customerName: z.string(),
  customerId: z.string(),
  commodityName: z.string(),
  destinationChamber: chamberTextSchema,
  storageMark: z.string(),
  partyMark: z.string().nullable().optional(),
  survivingBags: z.number().int().min(1),
  survivingSmallBags: z.number().int().min(0),
  survivingBigBags: z.number().int().min(0),
  resultingBagType: bagTypeSchema,
  totalMergedBags: z.number().int().min(1),
  sourceLots: z.array(mergeSourceLotSummarySchema),
  repackHamaliCharge: rentalAmountSchema.default(0),
  repackHamaliRate: z.number().min(0).default(0),
  hamaliReceiptNumber: z.string().nullable().optional(),
  repackVariance: z.number().int().default(0),
  carriedRentAmount: rentalAmountSchema.default(0),
  totalDueAtMerge: rentalAmountSchema.default(0),
  totalPaidAtMerge: rentalAmountSchema.default(0),
  remarks: z.string().nullable().optional(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type MergeShiftingInvoiceDocumentDto = z.infer<typeof mergeShiftingInvoiceDocumentDtoSchema>;
