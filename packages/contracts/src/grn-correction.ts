import { z } from 'zod';
import { bagTypeSchema, perBagWeightSchema } from './bags.js';
import { chamberTextSchema, indianVehicleSchema, rentalAmountSchema } from './common.js';
import { gpNumberSchema } from './identifiers.js';
import { bagPriceSchema } from './pricing.js';
import { rentMonthsInputSchema, rentTypeSchema } from './grn-rent.js';

/**
 * Full edit of an inward receipt (approved true full-edit workflow).
 *
 * Any field captured on the Inward form may be corrected through this workflow with a
 * mandatory audit reason: customer, date, commodity, chamber, bag type/counts/weights,
 * rent terms and pricing, and transport/logistics metadata. The workflow still honors
 * the architecture lock's transaction-immutability rule:
 * - CLOSED receipts and receipts with an active ISSUED challan refuse every edit.
 * - Once any challan/reversal history exists, structural fields (customer, commodity,
 *   bags, bag type, weights, rent terms, date) are frozen and only descriptive fields
 *   (chamber, marks, vehicle, remarks, gate pass) may still change.
 *
 * Permanently immutable numbering/lien identity (grnNumber, inwardReceiptNumber,
 * billNumber, bond/loan fields, status) is rejected by `.strict()` and must use the
 * dedicated reversal / loan / internal-movement workflows.
 */
export const correctGrnSchema = z
  .object({
    customerId: z.string().trim().min(1, 'customerId is required').optional(),
    date: z.coerce.date().optional(),
    commodityId: z.string().trim().min(1, 'commodityId is required').optional(),
    chamber: chamberTextSchema.optional(),
    bagType: bagTypeSchema.optional(),
    bags: z.number().int().positive('bags must be a positive integer').max(100000).optional(),
    /**
     * The corrected split, required together when a mixed receipt's total changes. A single-type
     * receipt's composition is derived from its bag type, so it takes no split.
     */
    smallBags: z.number().int().min(0).max(100000).optional(),
    bigBags: z.number().int().min(0).max(100000).optional(),
    smallBagWeight: perBagWeightSchema.nullish(),
    bigBagWeight: perBagWeightSchema.nullish(),
    rentType: rentTypeSchema.optional(),
    rentMonths: rentMonthsInputSchema.nullish(),
    rentAmount: rentalAmountSchema.nullish(),
    bagPrice: bagPriceSchema.nullish(),
    smallBagPrice: bagPriceSchema.nullish(),
    bigBagPrice: bagPriceSchema.nullish(),
    gpNumber: gpNumberSchema,
    storageMark: z.string().trim().max(20, 'Storage mark cannot exceed 20 characters').nullish(),
    partyMark: z.string().trim().max(20, 'Party mark cannot exceed 20 characters').nullish(),
    marks: z.string().trim().max(100).nullish(),
    vehicleNumber: indianVehicleSchema.nullish(),
    remarks: z.string().trim().max(500).nullish(),
    reason: z.string().trim().min(5, 'A correction reason of at least 5 characters is required').max(500),
  })
  .strict()
  .refine(
    (data) =>
      data.customerId !== undefined ||
      data.date !== undefined ||
      data.commodityId !== undefined ||
      data.chamber !== undefined ||
      data.bagType !== undefined ||
      data.bags !== undefined ||
      data.smallBags !== undefined ||
      data.bigBags !== undefined ||
      data.smallBagWeight !== undefined ||
      data.bigBagWeight !== undefined ||
      data.rentType !== undefined ||
      data.rentMonths !== undefined ||
      data.rentAmount !== undefined ||
      data.bagPrice !== undefined ||
      data.smallBagPrice !== undefined ||
      data.bigBagPrice !== undefined ||
      data.gpNumber !== undefined ||
      data.storageMark !== undefined ||
      data.partyMark !== undefined ||
      data.marks !== undefined ||
      data.vehicleNumber !== undefined ||
      data.remarks !== undefined,
    {
      message: 'Provide at least one editable field to correct',
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
  )
  .refine(
    (data) => {
      if (data.date === undefined) return true;
      const maxAllowed = new Date(Date.now() + 5 * 60 * 1000);
      return data.date <= maxAllowed;
    },
    {
      message: 'Inward date cannot be in the future',
      path: ['date'],
    },
  );

export type CorrectGrnInput = z.infer<typeof correctGrnSchema>;
