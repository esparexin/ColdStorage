import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, rentalAmountSchema } from './common.js';
import { grnNumberSchema } from './identifiers.js';
import { inwardReceiptNumberSchema, rentTypeSchema, grnStatusSchema } from './grn.js';

/**
 * Inward receipt acknowledgement projection.
 *
 * A read model of the receipt handed to the depositor. It carries the stored composition, never
 * a recomputed one, so the document always states what was actually recorded.
 */
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
      smallBags: z.number().int().min(0),
      bigBags: z.number().int().min(0),
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
  bondNumber: z.string().nullable().optional(),
  isBondForLoan: z.boolean().optional(),
  issuedBy: z.string().min(1),
  issuedAt: z.date(),
});

export type GrnAcknowledgement = z.infer<typeof grnAcknowledgementSchema>;

export const grnQuerySchema = z.object({
  customerId: z.string().optional(),
  commodityId: z.string().optional(),
  chamber: z.string().trim().max(20).optional(),
  status: grnStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GrnQuery = z.infer<typeof grnQuerySchema>;
