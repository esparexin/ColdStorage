import { z } from 'zod';
import { inventoryTransactionTypeSchema } from './inventory.js';

/**
 * P7 Dashboard Contracts — read-only presentation DTOs.
 * All values are derived from the canonical immutable inventory ledger
 * (InventoryTransactionModel) and facility master data.
 * No persisted counters. No ActivityModel.
 */

// ---------------------------------------------------------------------------
// ChamberUtilization
// ---------------------------------------------------------------------------

export const chamberUtilizationSchema = z.object({
  chamberId: z.string().min(1),
  chamberNumber: z.string().min(1),
  /** false when ChamberModel.isActive is false */
  isActive: z.boolean(),
  capacityBags: z.number().int().min(0),
  occupiedBags: z.number().int(),
  availableBags: z.number().int().min(0),
  /** 0–100, rounded to 2 decimal places; capped at 100 */
  utilizationRate: z.number().min(0).max(100),
});

export type ChamberUtilization = z.infer<typeof chamberUtilizationSchema>;

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

export const recentActivityItemSchema = z.object({
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
  /** InventoryTransactionDoc.positionCode (direct field) */
  positionCode: z.string().min(1),
  /** InventoryTransactionDoc.createdAt */
  date: z.date(),
  /** InventoryTransactionDoc.quantity — always positive display value */
  bags: z.number().int().positive(),
  /** DashboardService presentation projection — not persisted */
  summary: z.string().min(1),
});

export type RecentActivityItem = z.infer<typeof recentActivityItemSchema>;

// ---------------------------------------------------------------------------
// DashboardSummary
// ---------------------------------------------------------------------------

export const dashboardSummarySchema = z.object({
  facilityId: z.string().min(1),
  /** Sum of Position.capacityBags for all positions in the facility */
  totalCapacityBags: z.number().int().min(0),
  /** Derived from ledger: ∑ ledgerSignedQuantity across all transactions */
  occupiedBags: z.number().int(),
  /** max(0, totalCapacityBags − occupiedBags) */
  availableBags: z.number().int().min(0),
  /** min(100, round(occupiedBags / totalCapacityBags × 100, 2)); 0 when capacity is 0 */
  utilizationRate: z.number().min(0).max(100),
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
  /** Per-chamber breakdown; includes inactive chambers that hold stock */
  chamberUtilization: z.array(chamberUtilizationSchema),
  /** Current commodity stock > 0 bags; resolved from P3 global catalog */
  commodityBreakdown: z.array(commodityStockSchema),
  /** Up to 10 most recent approved ledger transactions, descending by createdAt */
  recentActivity: z.array(recentActivityItemSchema),
  /** ISO 8601 timestamp of when the summary was generated */
  generatedAt: z.date(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
