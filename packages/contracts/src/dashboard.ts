import { z } from 'zod';
import { chamberTextSchema } from './common.js';
import { inventoryTransactionTypeSchema } from './inventory.js';

/**
 * P7 Dashboard Contracts — read-only presentation DTOs.
 * All values are derived from the canonical immutable inventory ledger
 * (InventoryTransactionModel) and facility master data.
 * No persisted counters. No ActivityModel.
 */

// ---------------------------------------------------------------------------
// ChamberStock — stock held in a free-text chamber label.
//
// Capacity, occupancy and utilization are intentionally absent: chamber is a
// label, not a capacity-managed slot, so there is no denominator to report.
// ---------------------------------------------------------------------------

export const chamberStockSchema = z
  .object({
    chamber: chamberTextSchema,
    totalBags: z.number().int().min(0),
  })
  .strict();

export type ChamberStock = z.infer<typeof chamberStockSchema>;

// ---------------------------------------------------------------------------
// CommodityStock
// ---------------------------------------------------------------------------

export const commodityStockSchema = z.object({
  commodityId: z.string().min(1),
  /** Resolved from CommodityModel; falls back to commodityId if not found */
  commodityName: z.string().min(1),
  totalBags: z.number().int().positive(),
});

export type CommodityStock = z.infer<typeof commodityStockSchema>;

// ---------------------------------------------------------------------------
// RecentActivityItem — read-only presentation projection
// ---------------------------------------------------------------------------

export const recentActivityTypeSchema = z.enum([
  'INWARD_PUTAWAY',
  'OUTWARD_DELIVERY',
  'DELIVERY_REVERSAL',
]);
export type RecentActivityType = z.infer<typeof recentActivityTypeSchema>;

export const recentActivityItemSchema = z
  .object({
    /** InventoryTransactionDoc.id */
    id: z.string().min(1),
    /** InventoryTransactionDoc.transactionType */
    type: inventoryTransactionTypeSchema,
    /**
     * INWARD_PUTAWAY  → InventoryTransactionDoc.grnNumber (direct field)
     * OUTWARD_DELIVERY → DeliveryChallanDoc.challanNumber (via referenceId)
     * DELIVERY_REVERSAL → DeliveryReversalDoc.challanNumber (via referenceId)
     */
    referenceNumber: z.string().min(1),
    /** InventoryTransactionDoc.chamber (direct field) */
    chamber: chamberTextSchema,
    /** InventoryTransactionDoc.createdAt */
    date: z.date(),
    /** InventoryTransactionDoc.quantity — always positive display value */
    bags: z.number().int().positive(),
    /** DashboardService presentation projection — not persisted */
    summary: z.string().min(1),
  })
  .strict();

export type RecentActivityItem = z.infer<typeof recentActivityItemSchema>;

// ---------------------------------------------------------------------------
// DashboardSummary
// ---------------------------------------------------------------------------

export const dashboardSummarySchema = z
  .object({
    facilityId: z.string().min(1),
    /** Derived from ledger: ∑ ledgerSignedQuantity across all transactions */
    totalStockBags: z.number().int(),
    /** Count of GRNs with status === 'OPEN' */
    activeGrns: z.number().int().min(0),
    /** Count of GRNs with status === 'CLOSED' */
    closedGrns: z.number().int().min(0),
    /**
     * Net INWARD_PUTAWAY bags in the current calendar month (Asia/Kolkata).
     * Interval: [startOfMonth, startOfNextMonth)
     */
    monthlyInwardBags: z.number().int().min(0),
    /**
     * Net delivered bags (OUTWARD_DELIVERY − DELIVERY_REVERSAL) in the current
     * calendar month (Asia/Kolkata).
     * Interval: [startOfMonth, startOfNextMonth)
     */
    monthlyDeliveredBags: z.number().int(),
    /** Per-chamber stock breakdown grouped by the free-text chamber label */
    chamberStock: z.array(chamberStockSchema),
    /** Current commodity stock > 0 bags; resolved from P3 global catalog */
    commodityBreakdown: z.array(commodityStockSchema),
    /** Up to 10 most recent approved ledger transactions, descending by createdAt */
    recentActivity: z.array(recentActivityItemSchema),
    /** ISO 8601 timestamp of when the summary was generated */
    generatedAt: z.date(),
  })
  .strict();

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
