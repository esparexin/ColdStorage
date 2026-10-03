import { z } from 'zod';
import { bagTypeSchema } from './bags.js';
import { chamberTextSchema } from './common.js';

/**
 * P5: Inventory Contracts.
 *
 * Physical stock is derived from the immutable ledger, not from any storage structure. A GRN
 * is inward stock allocated into the free-text chamber recorded on that GRN. There are no
 * racks, levels, positions, capacities or occupancy.
 */

export const inventoryTransactionTypeSchema = z.enum([
  'INWARD_PUTAWAY',
  'OUTWARD_DELIVERY',
  'DELIVERY_REVERSAL',
]);
export type InventoryTransactionType = z.infer<typeof inventoryTransactionTypeSchema>;

export const inventoryReferenceTypeSchema = z.enum(['PUT_AWAY', 'DELIVERY', 'DELIVERY_REVERSAL']);
export type InventoryReferenceType = z.infer<typeof inventoryReferenceTypeSchema>;

/**
 * Put-away confirms that a GRN's remaining bags are on hand in its chamber. A single GRN holds
 * one commodity in one chamber, so allocation is whole-lot and needs no item breakdown.
 */
export const createPutAwaySchema = z
  .object({
    notes: z.string().trim().max(500, 'notes cannot exceed 500 characters').nullish(),
  })
  .strict();

export type CreatePutAwayInput = z.infer<typeof createPutAwaySchema>;

export const inventoryTransactionSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamber: chamberTextSchema,
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

export const putAwayAllocationSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  grnId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamber: chamberTextSchema,
  bags: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  allocatedBy: z.string().min(1),
  allocatedAt: z.date(),
});

export type PutAwayAllocation = z.infer<typeof putAwayAllocationSchema>;

export const putAwayStatusSchema = z.enum(['UNALLOCATED', 'ALLOCATED']);
export type PutAwayStatus = z.infer<typeof putAwayStatusSchema>;

export const grnInventorySummarySchema = z.object({
  grnId: z.string().min(1),
  facilityId: z.string().min(1),
  grnNumber: z.string().min(1),
  chamber: chamberTextSchema,
  totalBags: z.number().int().positive(),
  allocatedBags: z.number().int().min(0),
  unallocatedBags: z.number().int().min(0),
  putAwayStatus: putAwayStatusSchema,
});

export type GrnInventorySummary = z.infer<typeof grnInventorySummarySchema>;

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
      chamber: chamberTextSchema,
      totalBags: z.number().int().min(0),
    }),
  ),
});

export type FacilityInventorySummary = z.infer<typeof facilityInventorySummarySchema>;

export const stockLedgerQuerySchema = z.object({
  grnId: z.string().optional(),
  chamber: z.string().trim().max(20).optional(),
  commodityId: z.string().optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StockLedgerQuery = z.infer<typeof stockLedgerQuerySchema>;
