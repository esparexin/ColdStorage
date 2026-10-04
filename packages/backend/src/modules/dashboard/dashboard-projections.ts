import type { ChamberStock, CommodityStock, RecentActivityItem } from '@cold-storage/contracts';

export function projectChamberStock(
  byChamber: Array<{ _id: string; totalBags: number }>,
): ChamberStock[] {
  return byChamber
    .filter((row) => row.totalBags > 0)
    .map((row) => ({ chamber: row._id, totalBags: row.totalBags }))
    .sort((a, b) => b.totalBags - a.totalBags);
}

export function projectCommodityBreakdown(
  byCommodity: Array<{ _id: string; totalBags: number }>,
  commodityMap: Map<string, string>,
): CommodityStock[] {
  return byCommodity.map((c) => ({
    commodityId: c._id,
    commodityName: commodityMap.get(c._id) ?? c._id,
    totalBags: c.totalBags,
  }));
}

export function projectRecentActivity(
  recentTxns: Array<{
    id: string;
    transactionType: string;
    grnNumber: string;
    referenceId: string;
    chamber: string;
    createdAt: Date;
    smallQuantity: number;
    bigQuantity: number;
  }>,
  challanMap: Map<string, string>,
  reversalMap: Map<string, string>,
): RecentActivityItem[] {
  return recentTxns.map((t) => {
    let referenceNumber: string;
    if (t.transactionType === 'INWARD_PUTAWAY') {
      referenceNumber = t.grnNumber;
    } else if (t.transactionType === 'OUTWARD_DELIVERY') {
      referenceNumber = challanMap.get(t.referenceId) ?? t.referenceId;
    } else {
      referenceNumber = reversalMap.get(t.referenceId) ?? t.referenceId;
    }

    // The stored composition is summed for display. Sign is carried by the transaction type, so
    // the activity feed always shows a positive quantity.
    const bags = (t.smallQuantity ?? 0) + (t.bigQuantity ?? 0);
    const breakdown =
      t.bigQuantity > 0 ? ` (${t.smallQuantity} small, ${t.bigQuantity} big)` : '';

    let summary: string;
    if (t.transactionType === 'INWARD_PUTAWAY') {
      summary = `Put away ${bags} bags${breakdown} in chamber ${t.chamber}`;
    } else if (t.transactionType === 'OUTWARD_DELIVERY') {
      summary = `Delivered ${bags} bags${breakdown} via challan ${referenceNumber}`;
    } else {
      summary = `Reversed delivery ${referenceNumber} — ${bags} bags${breakdown} returned`;
    }

    return {
      id: t.id,
      type: t.transactionType as RecentActivityItem['type'],
      referenceNumber,
      chamber: t.chamber,
      date: t.createdAt,
      bags,
      summary,
    };
  });
}
