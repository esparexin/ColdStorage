import type {
  ChamberUtilization,
  CommodityStock,
  DashboardSummary,
  RecentActivityItem,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import {
  DeliveryChallanModel,
} from '../../database/models/delivery-challan.model.js';
import {
  DeliveryReversalModel,
} from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../database/models/position.model.js';

// ---------------------------------------------------------------------------
// Helpers — IST monthly window
// ---------------------------------------------------------------------------

/**
 * Returns the half-open [startOfMonth, startOfNextMonth) interval in Asia/Kolkata
 * for the calendar month containing `date`.
 */
function getIstMonthlyWindow(date: Date = new Date()): {
  startOfMonth: Date;
  startOfNextMonth: Date;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const yearStr = parts.find((p) => p.type === 'year')?.value ?? '';
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+05:30`,
  );
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startOfNextMonth = new Date(
    `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+05:30`,
  );
  return { startOfMonth, startOfNextMonth };
}

// ---------------------------------------------------------------------------
// Canonical ledger signed quantity expression
// Returns the final signed scalar. Applied via $sum exactly once.
// Never multiplied again anywhere in this file.
// ---------------------------------------------------------------------------

const ledgerSignedQuantity = {
  $cond: [
    { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
    '$quantity', // +quantity  — bags added to stock
    {
      $cond: [
        { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
        '$quantity', // +quantity  — bags returned to stock
        {
          $cond: [
            { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
            { $multiply: ['$quantity', -1] }, // −quantity — bags removed from stock
            0, // explicit zero — no implicit positive fallback
          ],
        },
      ],
    },
  ],
};

const APPROVED_RECENT_TYPES = ['INWARD_PUTAWAY', 'OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] as const;

// ---------------------------------------------------------------------------
// DashboardService
// ---------------------------------------------------------------------------

class DashboardService {
  /**
   * Assembles the complete operational dashboard summary for a facility.
   *
   * Authorization contract:
   *   The caller MUST have already passed the full P2 middleware chain:
   *   authenticate → requirePasswordChanged → requirePermission('dashboard:view')
   *   → requireFacilityScope(...).
   *   This service trusts the facilityId it receives.
   *
   * Database query bound: up to 9 bounded physical queries per call.
   *   Phase A — 6 unconditional concurrent queries.
   *   Phase B — up to 3 conditional batched lookups (skipped when ID sets are empty).
   */
  public async getSummary(facilityId: string): Promise<DashboardSummary> {
    const now = new Date();
    const { startOfMonth, startOfNextMonth } = getIstMonthlyWindow(now);

    // -------------------------------------------------------------------------
    // Phase A — 6 independent queries executed concurrently
    // -------------------------------------------------------------------------
    const [
      positionCapacities,   // Q1
      chambers,             // Q2
      facilityTotals,       // Q3
      stockBreakdown,       // Q4
      grnCounts,            // Q5
      recentTxns,           // Q6
    ] = await Promise.all([

      // Q1: Chamber installed capacity from PositionModel
      PositionModel.aggregate<{ _id: string; capacityBags: number }>([
        { $match: { facilityId } },
        { $group: { _id: '$chamberId', capacityBags: { $sum: '$capacityBags' } } },
      ]),

      // Q2: Chamber metadata (includes inactive chambers)
      ChamberModel.find({ facilityId })
        .select('id chamberNumber isActive')
        .lean()
        .exec(),

      // Q3: Facility-level totals and monthly metrics
      InventoryTransactionModel.aggregate<{
        _id: null;
        occupiedBags: number;
        monthlyInward: number;
        monthlyDelivered: number;
      }>([
        { $match: { facilityId } },
        {
          $group: {
            _id: null,
            // Sum ledgerSignedQuantity exactly once — final signed scalar
            occupiedBags: { $sum: ledgerSignedQuantity },
            // Monthly inward: unsigned INWARD_PUTAWAY bags within the IST interval
            monthlyInward: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
                      { $gte: ['$createdAt', startOfMonth] },
                      { $lt: ['$createdAt', startOfNextMonth] },
                    ],
                  },
                  '$quantity',
                  0,
                ],
              },
            },
            // Monthly delivered: net OUTWARD_DELIVERY − DELIVERY_REVERSAL in IST interval
            monthlyDelivered: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                      { $gte: ['$createdAt', startOfMonth] },
                      { $lt: ['$createdAt', startOfNextMonth] },
                    ],
                  },
                  '$quantity',
                  {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
                          { $gte: ['$createdAt', startOfMonth] },
                          { $lt: ['$createdAt', startOfNextMonth] },
                        ],
                      },
                      { $multiply: ['$quantity', -1] },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      ]),

      // Q4: Per-chamber and per-commodity stock breakdowns
      InventoryTransactionModel.aggregate<{
        byChamber: Array<{ _id: string; occupiedBags: number }>;
        byCommodity: Array<{ _id: string; totalBags: number }>;
      }>([
        { $match: { facilityId } },
        {
          $facet: {
            byChamber: [
              { $group: { _id: '$chamberId', occupiedBags: { $sum: ledgerSignedQuantity } } },
            ],
            byCommodity: [
              { $group: { _id: '$commodityId', totalBags: { $sum: ledgerSignedQuantity } } },
              { $match: { totalBags: { $gt: 0 } } },
            ],
          },
        },
      ]),

      // Q5: GRN lifecycle status counts
      GrnModel.aggregate<{ _id: string; count: number }>([
        { $match: { facilityId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Q6: Recent approved ledger transactions (exactly 3 approved types)
      InventoryTransactionModel.find({
        facilityId,
        transactionType: { $in: [...APPROVED_RECENT_TYPES] },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .exec(),
    ]);

    // -------------------------------------------------------------------------
    // Extract Phase B input ID sets from Phase A results
    // -------------------------------------------------------------------------
    const facetResult = stockBreakdown[0] ?? { byChamber: [], byCommodity: [] };
    const commodityIds = facetResult.byCommodity.map((c) => c._id);

    // deliveryIds: referenceId where transactionType === 'OUTWARD_DELIVERY'
    //              (referenceType === 'DELIVERY' → DeliveryChallanModel.id)
    const deliveryIds = recentTxns
      .filter((t) => t.transactionType === 'OUTWARD_DELIVERY')
      .map((t) => t.referenceId);

    // reversalIds: referenceId where transactionType === 'DELIVERY_REVERSAL'
    //              (referenceType === 'DELIVERY_REVERSAL' → DeliveryReversalModel.id)
    const reversalIds = recentTxns
      .filter((t) => t.transactionType === 'DELIVERY_REVERSAL')
      .map((t) => t.referenceId);

    // -------------------------------------------------------------------------
    // Phase B — up to 3 conditional batched lookups (concurrent via Promise.all)
    // Empty ID sets short-circuit without issuing a database query.
    // -------------------------------------------------------------------------
    const [commodities, challans, reversals] = await Promise.all([

      // Q7 (conditional): Commodity catalog — P3 global master (no facilityId)
      commodityIds.length > 0
        ? CommodityModel.find({ id: { $in: commodityIds } })
            .select('id name')
            .lean()
            .exec()
        : Promise.resolve([]),

      // Q8 (conditional): Challan reference numbers — facility-scoped
      deliveryIds.length > 0
        ? DeliveryChallanModel.find({ facilityId, id: { $in: deliveryIds } })
            .select('id challanNumber')
            .lean()
            .exec()
        : Promise.resolve([]),

      // Q9 (conditional): Reversal reference numbers — facility-scoped
      reversalIds.length > 0
        ? DeliveryReversalModel.find({ facilityId, id: { $in: reversalIds } })
            .select('id challanNumber')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    // -------------------------------------------------------------------------
    // Projection: build lookup maps for O(1) access
    // -------------------------------------------------------------------------
    const commodityMap = new Map<string, string>(
      commodities.map((c) => [c.id, (c as unknown as { name: string }).name]),
    );
    const challanMap = new Map<string, string>(
      challans.map((c) => [c.id, (c as unknown as { challanNumber: string }).challanNumber]),
    );
    const reversalMap = new Map<string, string>(
      reversals.map((r) => [r.id, (r as unknown as { challanNumber: string }).challanNumber]),
    );

    // -------------------------------------------------------------------------
    // KPI calculations
    // -------------------------------------------------------------------------
    const totals = facilityTotals[0];
    const rawOccupied = totals?.occupiedBags ?? 0;
    const rawMonthlyInward = totals?.monthlyInward ?? 0;
    const rawMonthlyDelivered = totals?.monthlyDelivered ?? 0;

    // Chamber capacity from PositionModel aggregation
    const capacityMap = new Map<string, number>(
      positionCapacities.map((p) => [p._id, p.capacityBags]),
    );
    const totalCapacityBags = positionCapacities.reduce((sum, p) => sum + p.capacityBags, 0);
    const occupiedBags = rawOccupied;
    const availableBags = Math.max(0, totalCapacityBags - occupiedBags);
    const utilizationRate =
      totalCapacityBags === 0
        ? 0
        : Math.min(100, Math.round((occupiedBags / totalCapacityBags) * 10000) / 100);

    // GRN counts
    const activeGrns = grnCounts.find((g) => g._id === 'OPEN')?.count ?? 0;
    const closedGrns = grnCounts.find((g) => g._id === 'CLOSED')?.count ?? 0;

    // -------------------------------------------------------------------------
    // Projection: ChamberUtilization
    // All chambers are included; inactive chambers with stock are tagged.
    // Chamber sum must equal facility total (reconciliation invariant).
    // -------------------------------------------------------------------------
    const chamberStockMap = new Map<string, number>(
      facetResult.byChamber.map((c) => [c._id, c.occupiedBags]),
    );

    const chamberUtilization: ChamberUtilization[] = chambers.map((ch) => {
      const cap = capacityMap.get(ch.id) ?? 0;
      const occ = chamberStockMap.get(ch.id) ?? 0;
      const avail = Math.max(0, cap - occ);
      const rate = cap === 0 ? 0 : Math.min(100, Math.round((occ / cap) * 10000) / 100);
      return {
        chamberId: ch.id,
        chamberNumber: ch.chamberNumber,
        isActive: ch.isActive,
        capacityBags: cap,
        occupiedBags: occ,
        availableBags: avail,
        utilizationRate: rate,
      };
    });

    // -------------------------------------------------------------------------
    // Projection: CommodityStock
    // -------------------------------------------------------------------------
    const commodityBreakdown: CommodityStock[] = facetResult.byCommodity.map((c) => ({
      commodityId: c._id,
      commodityName: commodityMap.get(c._id) ?? c._id,
      totalBags: c.totalBags,
    }));

    // -------------------------------------------------------------------------
    // Projection: RecentActivityItem
    // Each field maps to an explicit source. No ActivityModel. Not persisted.
    // -------------------------------------------------------------------------
    const recentActivity: RecentActivityItem[] = recentTxns.map((t) => {
      // referenceNumber resolution:
      //   INWARD_PUTAWAY  → grnNumber (direct field on transaction)
      //   OUTWARD_DELIVERY → challanNumber via referenceId → DeliveryChallan
      //   DELIVERY_REVERSAL → challanNumber via referenceId → DeliveryReversal
      let referenceNumber: string;
      if (t.transactionType === 'INWARD_PUTAWAY') {
        referenceNumber = t.grnNumber;
      } else if (t.transactionType === 'OUTWARD_DELIVERY') {
        referenceNumber = challanMap.get(t.referenceId) ?? t.referenceId;
      } else {
        // DELIVERY_REVERSAL
        referenceNumber = reversalMap.get(t.referenceId) ?? t.referenceId;
      }

      // summary — presentation projection, not persisted
      let summary: string;
      if (t.transactionType === 'INWARD_PUTAWAY') {
        summary = `Put away ${t.quantity} bags at ${t.positionCode}`;
      } else if (t.transactionType === 'OUTWARD_DELIVERY') {
        summary = `Delivered ${t.quantity} bags via challan ${referenceNumber}`;
      } else {
        summary = `Reversed delivery ${referenceNumber} — ${t.quantity} bags returned`;
      }

      return {
        id: t.id,
        type: t.transactionType,
        referenceNumber,
        positionCode: t.positionCode, // direct field — no lookup
        date: t.createdAt,
        bags: t.quantity, // always positive display value
        summary,
      };
    });

    return {
      facilityId,
      totalCapacityBags,
      occupiedBags,
      availableBags,
      utilizationRate,
      activeGrns,
      closedGrns,
      monthlyInwardBags: Math.max(0, rawMonthlyInward),
      monthlyDeliveredBags: rawMonthlyDelivered,
      chamberUtilization,
      commodityBreakdown,
      recentActivity,
      generatedAt: now,
    };
  }
}

export const dashboardService = new DashboardService();
