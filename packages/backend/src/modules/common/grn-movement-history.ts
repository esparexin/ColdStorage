import type { GrnMovementEntry, GrnMovementHistory } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';

/**
 * Reconstructs the canonical movement history for a GRN directly from authoritative documents:
 * - GrnModel (Inward event, initial stock)
 * - DeliveryChallanModel (Outward delivery events)
 * - DeliveryReversalModel (Delivery reversal events)
 */
export async function getGrnMovementHistory(
  facilityId: string,
  grnId: string,
): Promise<GrnMovementHistory | null> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) return null;

  const [challans, reversals] = await Promise.all([
    DeliveryChallanModel.find({ grnId, facilityId }).lean().exec(),
    DeliveryReversalModel.find({ grnId, facilityId }).lean().exec(),
  ]);

  const challanMap = new Map(challans.map((c) => [c.id, c]));

  type MovementItem =
    | { kind: 'CHALLAN'; date: Date; createdAt: Date; challan: (typeof challans)[0] }
    | { kind: 'REVERSAL'; date: Date; createdAt: Date; reversal: (typeof reversals)[0] };

  const timeline: MovementItem[] = [
    ...challans.map((c) => ({
      kind: 'CHALLAN' as const,
      date: c.date,
      createdAt: c.createdAt,
      challan: c,
    })),
    ...reversals.map((r) => ({
      kind: 'REVERSAL' as const,
      date: r.reversedAt,
      createdAt: r.reversedAt,
      reversal: r,
    })),
  ];

  timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const entries: GrnMovementEntry[] = [
    {
      date: grn.date,
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      type: 'INWARD',
      openingBags: 0,
      deliveredBags: 0,
      closingBags: grn.bags,
      marks: grn.marks ?? null,
      gpNumber: grn.gpNumber ?? null,
      vehicleNumber: grn.vehicleNumber ?? null,
      remarks: grn.remarks ?? null,
      performedBy: grn.createdBy,
    },
  ];

  let runningBalance = grn.bags;
  let netDelivered = 0;

  for (const item of timeline) {
    if (item.kind === 'CHALLAN') {
      const c = item.challan;
      const deliveredCount = c.bags;
      const opening = runningBalance;
      const closing = Math.max(0, runningBalance - deliveredCount);
      runningBalance = closing;
      netDelivered += deliveredCount;

      entries.push({
        date: c.date,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: closing === 0 ? 'FINAL_OUTWARD' : 'PARTIAL_OUTWARD',
        openingBags: opening,
        deliveredBags: deliveredCount,
        closingBags: closing,
        challanNumber: c.challanNumber ?? null,
        deliveryId: c.id,
        marks: c.marks ?? grn.marks ?? null,
        gpNumber: c.gpNumber ?? grn.gpNumber ?? null,
        vehicleNumber: c.vehicleNumber ?? null,
        driverName: c.driverName ?? null,
        remarks: c.remarks ?? null,
        performedBy: c.issuedBy,
      });
    } else {
      const r = item.reversal;
      const originalChallan = challanMap.get(r.deliveryId);
      const returnedCount = originalChallan?.bags ?? 0;
      const opening = runningBalance;
      const closing = runningBalance + returnedCount;
      runningBalance = closing;
      netDelivered -= returnedCount;

      entries.push({
        date: r.reversedAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: 'DELIVERY_REVERSAL',
        openingBags: opening,
        deliveredBags: returnedCount,
        closingBags: closing,
        challanNumber: r.challanNumber ?? null,
        reversalId: r.id,
        marks: grn.marks ?? null,
        gpNumber: grn.gpNumber ?? null,
        remarks: r.reason ?? null,
        performedBy: r.reversedBy,
      });
    }
  }

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    customerId: grn.customerId,
    customerName: grn.customerName,
    commodityId: grn.commodityId,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    inwardDate: grn.date,
    totalInwardBags: grn.bags,
    netDeliveredBags: Math.max(0, netDelivered),
    currentClosingBags: runningBalance,
    status: grn.status,
    entries,
  };
}
