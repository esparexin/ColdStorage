import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { facilitySubHeaderSchema, organizationHeaderSchema } from './documents.js';

/**
 * Sorting, Grading & Repacking Labor & Bardana Service Invoice DTO (canonical SRT-INV format).
 * Represents official service invoicing for physical handling, grading, and packaging supplies.
 */
export const sortingInvoiceDocumentDtoSchema = z.object({
  organization: organizationHeaderSchema,
  facility: facilitySubHeaderSchema,
  sortingInvoiceNumber: z.string(),
  movementDate: z.coerce.date(),
  grnNumber: z.string(),
  commodityName: z.string(),
  chamber: chamberTextSchema,
  storageMark: z.string(),
  partyMark: z.string().nullable().optional(),
  customerId: z.string(),
  customerName: z.string(),
  originalBags: z.number().int().min(1),
  originalSmallBags: z.number().int().min(0),
  originalBigBags: z.number().int().min(0),
  originalBagType: bagTypeSchema,
  repackedBags: z.number().int().min(1),
  repackedSmallBags: z.number().int().min(0),
  repackedBigBags: z.number().int().min(0),
  resultingBagType: bagTypeSchema,
  variance: z.number().int().default(0),
  varianceReason: z.string().nullable().optional(),
  sortingLaborRate: z.number().min(0).default(0),
  sortingLaborCharge: rentalAmountSchema.default(0),
  newBagsSupplied: z.number().int().min(0).default(0),
  newBagRate: z.number().min(0).default(0),
  bardanaCharge: rentalAmountSchema.default(0),
  totalServiceCharge: rentalAmountSchema.default(0),
  remarks: z.string().nullable().optional(),
  generatedAt: z.coerce.date(),
  generatedBy: z.string(),
});

export type SortingInvoiceDocumentDto = z.infer<typeof sortingInvoiceDocumentDtoSchema>;
