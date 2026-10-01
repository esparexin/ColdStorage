import { z } from 'zod';
import { indianVehicleSchema } from './common.js';
import { challanNumberSchema } from './identifiers.js';
import { grnStatusSchema } from './grn.js';
import { allocationItemSchema } from './inventory.js';

/**
 * P6: Delivery + Outward Challan + Full Reversal + GRN Closure Contracts.
 * Strict SSOT:
 * - DeliveryChallan: Outward delivery record with independent FY challan numbering.
 * - DeliveryReversal: Operational full-reversal audit record.
 * - InventoryTransaction: Canonical immutable stock ledger event.
 */

export const deliveryStatusSchema = z.enum(['ISSUED', 'REVERSED']);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliveryItemSchema = z.object({
  positionId: z.string().min(1),
  positionCode: z.string().min(1),
  bags: z.number().int().positive(),
});

export type DeliveryItem = z.infer<typeof deliveryItemSchema>;

export const createDeliverySchema = z
  .object({
    grnId: z.string().trim().min(1, 'grnId is required'),
    date: z.coerce.date().default(() => new Date()),
    items: z
      .array(allocationItemSchema)
      .min(1, 'At least one delivery item is required')
      .max(50, 'Cannot exceed 50 delivery items in a single request'),
    vehicleNumber: indianVehicleSchema.nullish(),
    driverName: z.string().trim().max(100).nullish(),
    weight: z.number().positive('weight must be positive').nullish(),
    remarks: z.string().trim().max(500).nullish(),
  })
  .refine(
    (data) => {
      const positionIds = data.items.map((i) => i.positionId);
      return new Set(positionIds).size === positionIds.length;
    },
    {
      message: 'Duplicate positionId in delivery items is not permitted',
      path: ['items'],
    },
  )
  .refine(
    (data) => {
      const maxFutureAllowed = new Date(Date.now() + 5 * 60 * 1000);
      return data.date <= maxFutureAllowed;
    },
    {
      message: 'Delivery date cannot be in the future',
      path: ['date'],
    },
  );

export type CreateDeliveryInput = z.input<typeof createDeliverySchema>;
export type CreateDeliveryDTO = z.infer<typeof createDeliverySchema>;

export const reverseDeliverySchema = z.object({
  reason: z.string().trim().min(5, 'Reversal reason must be at least 5 characters').max(500),
});

export type ReverseDeliveryInput = z.infer<typeof reverseDeliverySchema>;

export const deliveryChallanSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  challanNumber: challanNumberSchema,
  date: z.date(),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  commodityId: z.string().min(1),
  commodityName: z.string().min(1),
  chamberId: z.string().min(1),
  chamberNumber: z.string().min(1),
  items: z.array(deliveryItemSchema),
  totalBags: z.number().int().positive(),
  vehicleNumber: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: deliveryStatusSchema,
  issuedBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DeliveryChallan = z.infer<typeof deliveryChallanSchema>;

export const deliveryReversalSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  deliveryId: z.string().min(1),
  challanNumber: challanNumberSchema,
  grnId: z.string().min(1),
  reason: z.string().min(1),
  reversedBy: z.string().min(1),
  reversedAt: z.date(),
});

export type DeliveryReversal = z.infer<typeof deliveryReversalSchema>;

export const deliverySummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  totalReceivedBags: z.number().int().positive(),
  netDeliveredBags: z.number().int().min(0),
  remainingDeliveryBalance: z.number().int().min(0),
  physicallyStoredBags: z.number().int().min(0),
  grnStatus: grnStatusSchema,
  deliveries: z.array(deliveryChallanSchema),
});

export type DeliverySummary = z.infer<typeof deliverySummarySchema>;

export const deliveryQuerySchema = z.object({
  grnId: z.string().optional(),
  customerId: z.string().optional(),
  status: deliveryStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;
