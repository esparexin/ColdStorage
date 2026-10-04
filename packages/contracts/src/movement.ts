import { z } from 'zod';
import { grnNumberSchema, challanNumberSchema } from './identifiers.js';
import { grnStatusSchema } from './grn.js';

export const grnMovementTypeSchema = z.enum([
  'INWARD',
  'PARTIAL_OUTWARD',
  'FINAL_OUTWARD',
  'DELIVERY_REVERSAL',
]);
export type GrnMovementType = z.infer<typeof grnMovementTypeSchema>;

export const grnMovementEntrySchema = z.object({
  date: z.date(),
  grnId: z.string().min(1),
  grnNumber: grnNumberSchema,
  type: grnMovementTypeSchema,
  openingBags: z.number().int().min(0),
  deliveredBags: z.number().int().min(0),
  closingBags: z.number().int().min(0),
  challanNumber: challanNumberSchema.nullable().optional(),
  deliveryId: z.string().nullable().optional(),
  reversalId: z.string().nullable().optional(),
  marks: z.string().nullable().optional(),
  gpNumber: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  performedBy: z.string().optional(),
});
export type GrnMovementEntry = z.infer<typeof grnMovementEntrySchema>;

export const grnMovementHistorySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: grnNumberSchema,
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  commodityId: z.string().min(1),
  commodityName: z.string().min(1),
  chamber: z.string().min(1),
  inwardDate: z.date(),
  totalInwardBags: z.number().int().positive(),
  netDeliveredBags: z.number().int().min(0),
  currentClosingBags: z.number().int().min(0),
  status: grnStatusSchema,
  entries: z.array(grnMovementEntrySchema),
});
export type GrnMovementHistory = z.infer<typeof grnMovementHistorySchema>;
