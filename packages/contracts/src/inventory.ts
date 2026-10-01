import { z } from 'zod';
import { bagTypeSchema } from './bags.js';

/**
 * P5: Inventory + Rack Allocation Contracts.
 * Strict SSOT:
 * - InventoryTransaction: Canonical immutable stock ledger event.
 * - PutAwayAllocation: Operational batch audit record.
 * - Ledger event type is strictly 'INWARD_PUTAWAY' with positive integer quantities.
 */

export const allocationItemSchema = z.object({
  positionId: z.string().trim().min(1, 'positionId is required'),
  bags: z.number().int().positive('bags must be a positive integer').max(100000, 'bags cannot exceed 100,000'),
});

export type AllocationItem = z.infer<typeof allocationItemSchema>;

export const createPutAwaySchema = z
  .object({
    items: z
      .array(allocationItemSchema)
      .min(1, 'At least one allocation item is required')
      .max(50, 'Cannot exceed 50 allocation items in a single request'),
    notes: z.string().trim().max(500, 'notes cannot exceed 500 characters').nullish(),
  })
  .refine(
    (data) => {
      const positionIds = data.items.map((i) => i.positionId);
      return new Set(positionIds).size === positionIds.length;
    },
    {
      message: 'Duplicate positionId in allocation items is not permitted',
      path: ['items'],
    },
  );

export type CreatePutAwayInput = z.infer<typeof createPutAwaySchema>;

export const inventoryTransactionTypeSchema = z.enum([
  'INWARD_PUTAWAY',
  'OUTWARD_DELIVERY',
  'DELIVERY_REVERSAL',
]);
export type InventoryTransactionType = z.infer<typeof inventoryTransactionTypeSchema>;

export const inventoryReferenceTypeSchema = z.enum([
  'PUT_AWAY',
  'DELIVERY',
  'DELIVERY_REVERSAL',
]);
export type InventoryReferenceType = z.infer<typeof inventoryReferenceTypeSchema>;

export const inventoryTransactionSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamberId: z.string().min(1),
  rackId: z.string().min(1),
  levelId: z.string().min(1),
  positionId: z.string().min(1),
  positionCode: z.string().min(1),
  customerId: z.string().min(1),
  commodityId: z.string().min(1),
  bagType: bagTypeSchema,
  transactionType: inventoryTransactionTypeSchema,
  quantity: z.number().int().positive(),
  referenceType: inventoryReferenceTypeSchema,
  referenceId: z.string().min(1),
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
});

export type InventoryTransaction = z.infer<typeof inventoryTransactionSchema>;

export const putAwayItemSchema = z.object({
  positionId: z.string().min(1),
  positionCode: z.string().min(1),
  bags: z.number().int().positive(),
});

export type PutAwayItem = z.infer<typeof putAwayItemSchema>;

export const putAwayAllocationSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamberId: z.string().min(1),
  items: z.array(putAwayItemSchema),
  totalBags: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  allocatedBy: z.string().min(1),
  allocatedAt: z.date(),
});

export type PutAwayAllocation = z.infer<typeof putAwayAllocationSchema>;

export const putAwayStatusSchema = z.enum(['UNALLOCATED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED']);
export type PutAwayStatus = z.infer<typeof putAwayStatusSchema>;

export const grnInventorySummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamberId: z.string().min(1),
  chamberNumber: z.string().min(1),
  totalBags: z.number().int().positive(),
  allocatedBags: z.number().int().min(0),
  unallocatedBags: z.number().int().min(0),
  putAwayStatus: putAwayStatusSchema,
  positions: z.array(
    z.object({
      positionId: z.string().min(1),
      positionCode: z.string().min(1),
      bags: z.number().int().positive(),
    }),
  ),
});

export type GrnInventorySummary = z.infer<typeof grnInventorySummarySchema>;

export const positionOccupancySchema = z.object({
  positionId: z.string().min(1),
  facilityId: z.string().min(1),
  chamberId: z.string().min(1),
  rackId: z.string().min(1),
  levelId: z.string().min(1),
  code: z.string().min(1),
  capacityBags: z.number().int().positive(),
  occupiedBags: z.number().int().min(0),
  availableBags: z.number().int().min(0),
  utilizationRate: z.number().min(0).max(100),
  storedLots: z.array(
    z.object({
      grnId: z.string().min(1),
      grnNumber: z.string().min(1),
      customerId: z.string().min(1),
      commodityId: z.string().min(1),
      bagType: bagTypeSchema,
      bags: z.number().int().positive(),
    }),
  ),
});

export type PositionOccupancy = z.infer<typeof positionOccupancySchema>;

export const facilityInventorySummarySchema = z.object({
  facilityId: z.string().min(1),
  totalStockBags: z.number().int().min(0),
  byCommodity: z.array(
    z.object({
      commodityId: z.string().min(1),
      commodityName: z.string().min(1),
      totalBags: z.number().int().min(0),
    }),
  ),
  byChamber: z.array(
    z.object({
      chamberId: z.string().min(1),
      chamberNumber: z.string().min(1),
      totalBags: z.number().int().min(0),
    }),
  ),
});

export type FacilityInventorySummary = z.infer<typeof facilityInventorySummarySchema>;

export const stockLedgerQuerySchema = z.object({
  grnId: z.string().optional(),
  positionId: z.string().optional(),
  chamberId: z.string().optional(),
  commodityId: z.string().optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StockLedgerQuery = z.infer<typeof stockLedgerQuerySchema>;
