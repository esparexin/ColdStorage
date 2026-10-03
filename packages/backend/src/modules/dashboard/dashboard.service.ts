import type { DashboardSummary } from '@cold-storage/contracts';
import {
  projectChamberStock,
  projectCommodityBreakdown,
  projectRecentActivity,
} from './dashboard-projections.js';
import { fetchPhaseAData, fetchPhaseBData, getIstMonthlyWindow } from './dashboard-queries.js';

export class DashboardService {
  /**
   * Assembles the complete operational dashboard summary for a facility.
   *
   * Authorization contract:
   *   The caller MUST have already passed the full P2 middleware chain:
   *   authenticate → requirePasswordChanged → requirePermission('dashboard:view')
   *   → requireFacilityScope(...).
   *   This service trusts the facilityId it receives.
   *
   * There is no capacity, occupancy or utilization to report: chamber is a free-text label, so
   * the summary reports stock held per chamber label alongside the commodity breakdown.
   */
  public async getSummary(facilityId: string): Promise<DashboardSummary> {
    const now = new Date();
    const { startOfMonth, startOfNextMonth } = getIstMonthlyWindow(now);

    const [facilityTotals, stockBreakdown, grnCounts, recentTxns] = await fetchPhaseAData(
      facilityId,
      startOfMonth,
      startOfNextMonth,
    );

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
    const activeGrns = grnCounts.find((g) => g._id === 'OPEN')?.count ?? 0;
    const closedGrns = grnCounts.find((g) => g._id === 'CLOSED')?.count ?? 0;

    return {
      facilityId,
      totalStockBags: totals?.totalBags ?? 0,
      activeGrns,
      closedGrns,
      monthlyInwardBags: Math.max(0, totals?.monthlyInward ?? 0),
      monthlyDeliveredBags: totals?.monthlyDelivered ?? 0,
      chamberStock: projectChamberStock(facetResult.byChamber),
      commodityBreakdown: projectCommodityBreakdown(facetResult.byCommodity, commodityMap),
      recentActivity: projectRecentActivity(
        recentTxns as unknown as Parameters<typeof projectRecentActivity>[0],
        challanMap,
        reversalMap,
      ),
      generatedAt: now,
    };
  }
}

export const dashboardService = new DashboardService();