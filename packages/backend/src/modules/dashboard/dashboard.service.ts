import type { DashboardSummary } from '@cold-storage/contracts';
import {
  projectChamberUtilization,
  projectCommodityBreakdown,
  projectRecentActivity,
} from './dashboard-projections.js';
import {
  fetchPhaseAData,
  fetchPhaseBData,
  getIstMonthlyWindow,
} from './dashboard-queries.js';

export class DashboardService {
  /**
   * Assembles the complete operational dashboard summary for a facility.
   *
   * Authorization contract:
   *   The caller MUST have already passed the full P2 middleware chain:
   *   authenticate → requirePasswordChanged → requirePermission('dashboard:view')
   *   → requireFacilityScope(...).
   *   This service trusts the facilityId it receives.
   */
  public async getSummary(facilityId: string): Promise<DashboardSummary> {
    const now = new Date();
    const { startOfMonth, startOfNextMonth } = getIstMonthlyWindow(now);

    const [
      positionCapacities,
      chambers,
      facilityTotals,
      stockBreakdown,
      grnCounts,
      recentTxns,
    ] = await fetchPhaseAData(facilityId, startOfMonth, startOfNextMonth);

    const facetResult = stockBreakdown[0] ?? { byChamber: [], byCommodity: [] };
    const commodityIds = facetResult.byCommodity.map((c) => c._id);
    const deliveryIds = recentTxns
      .filter((t) => t.transactionType === 'OUTWARD_DELIVERY')
      .map((t) => t.referenceId);
    const reversalIds = recentTxns
      .filter((t) => t.transactionType === 'DELIVERY_REVERSAL')
      .map((t) => t.referenceId);

    const [commodities, challans, reversals] = await fetchPhaseBData(
      facilityId,
      commodityIds,
      deliveryIds,
      reversalIds,
    );

    const commodityMap = new Map<string, string>(
      commodities.map((c) => [c.id, (c as unknown as { name: string }).name]),
    );
    const challanMap = new Map<string, string>(
      challans.map((c) => [c.id, (c as unknown as { challanNumber: string }).challanNumber]),
    );
    const reversalMap = new Map<string, string>(
      reversals.map((r) => [r.id, (r as unknown as { challanNumber: string }).challanNumber]),
    );

    const totals = facilityTotals[0];
    const rawOccupied = totals?.occupiedBags ?? 0;
    const rawMonthlyInward = totals?.monthlyInward ?? 0;
    const rawMonthlyDelivered = totals?.monthlyDelivered ?? 0;

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

    const activeGrns = grnCounts.find((g) => g._id === 'OPEN')?.count ?? 0;
    const closedGrns = grnCounts.find((g) => g._id === 'CLOSED')?.count ?? 0;

    const chamberStockMap = new Map<string, number>(
      facetResult.byChamber.map((c) => [c._id, c.occupiedBags]),
    );

    const chamberUtilization = projectChamberUtilization(chambers, capacityMap, chamberStockMap);
    const commodityBreakdown = projectCommodityBreakdown(facetResult.byCommodity, commodityMap);
    const recentActivity = projectRecentActivity(recentTxns as any, challanMap, reversalMap);

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
