import type {
  ChamberUtilization,
  CommodityStock,
  RecentActivityItem,
} from '@cold-storage/contracts';

export function projectChamberUtilization(
  chambers: Array<{ id: string; chamberNumber: string; isActive: boolean }>,
  capacityMap: Map<string, number>,
  chamberStockMap: Map<string, number>,
): ChamberUtilization[] {
  return chambers.map((ch) => {
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
    positionCode: string;
    createdAt: Date;
    quantity: number;
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
      type: t.transactionType as 'INWARD_PUTAWAY' | 'OUTWARD_DELIVERY' | 'DELIVERY_REVERSAL',
      referenceNumber,
      positionCode: t.positionCode,
      date: t.createdAt,
      bags: t.quantity,
      summary,
    };
  });
}
