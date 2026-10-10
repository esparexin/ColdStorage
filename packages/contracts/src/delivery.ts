import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema, indianVehicleSchema } from './common.js';
import { challanNumberSchema } from './identifiers.js';
import { grnStatusSchema } from './grn.js';

/**
 * P6: Delivery + Outward Challan + Full Reversal + GRN Closure Contracts.
 * Strict SSOT:
 * - DeliveryChallan: Outward delivery record with independent FY challan numbering.
 * - DeliveryReversal: Operational full-reversal audit record.
 * - InventoryTransaction: Canonical immutable stock ledger event.
 */

export const deliveryStatusSchema = z.enum(['ISSUED', 'REVERSED']);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

/**
 * A GRN is one commodity in one chamber, so an outward movement withdraws bags from that GRN's
 * available balance.
 * Delivery requires bags to deliver (either as quantity or composition).
 */
export const createDeliverySchema = z
  .object({
    grnId: z.string().trim().min(1, 'grnId is required'),
    date: z.coerce.date().default(() => new Date()),
    quantity: z.number().int().positive('Quantity must be positive').max(100000).nullish(),
    smallBags: z
      .number({ invalid_type_error: 'Small bags must be a number' })
      .int('Small bags must be a whole number')
      .min(0, 'Small bags cannot be negative')
      .max(100000, 'Small bags cannot exceed 100,000')
      .default(0),
    bigBags: z
      .number({ invalid_type_error: 'Big bags must be a number' })
      .int('Big bags must be a whole number')
      .min(0, 'Big bags cannot be negative')
      .max(100000, 'Big bags cannot exceed 100,000')
      .default(0),
    marks: z.string().trim().max(100).nullish(),
    gpNumber: z.string().trim().max(100).nullish(),
    vehicleNumber: indianVehicleSchema.nullish(),
    driverName: z.string().trim().max(100).nullish(),
    weight: z.number().positive('weight must be positive').nullish(),
    remarks: z.string().trim().max(500).nullish(),
    bagCategory: z.enum(['Small', 'Big', 'Small & Big']).nullish(),
    rentCharge: z.number().min(0).nullish(),
  })
  .refine((data) => (data.quantity && data.quantity > 0) || data.smallBags + data.bigBags > 0, {
    message: 'Delivery must move at least one bag',
    path: ['smallBags'],
  })
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
  chamber: chamberTextSchema,
  bagType: bagTypeSchema.optional(),
  smallBags: z.number().int().min(0),
  bigBags: z.number().int().min(0),
  /** Derived as smallBags + bigBags. Never stored, so the two parts cannot disagree. */
  totalBags: z.number().int().positive(),
  marks: z.string().nullable().optional(),
  gpNumber: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: deliveryStatusSchema,
  issuedBy: z.string().min(1),
  originalBags: z.number().int().min(0).optional(),
  remainingSmallBags: z.number().int().min(0).optional(),
  remainingBigBags: z.number().int().min(0).optional(),
  remainingTotalBags: z.number().int().min(0).optional(),
  rentPaymentStatus: z.enum(['Settled', 'Not Settled']).optional(),
  rentRemainingBalance: z.number().min(0).optional(),
  rentTotalAmount: z.number().min(0).optional(),
  rentTotalPaid: z.number().min(0).optional(),
  rentCharge: z.number().min(0).optional(),
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

/**
 * Per-GRN outward position. The three balance figures are the bag composition of what was
 * received, what has left net of reversals, and what therefore remains on hand.
 *
 * `remainingDeliveryBalance` and `physicallyStoredBags` were previously two DTO fields assigned
 * from one expression; they are collapsed into `remaining` here so the API cannot present the
 * same quantity under two names.
 */
export const deliverySummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  totalReceivedBags: z.number().int().positive(),
  netDeliveredBags: z.number().int().min(0),
  remainingDeliveryBalance: z.number().int().min(0),
  physicallyStoredBags: z.number().int().min(0),
  availableSmallBags: z.number().int().min(0),
  availableBigBags: z.number().int().min(0),
  netDeliveredSmallBags: z.number().int().min(0),
  netDeliveredBigBags: z.number().int().min(0),
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
