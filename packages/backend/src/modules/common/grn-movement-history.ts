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
    // Reversed challans stay on the timeline, and they DO move the running balance: the goods
    // physically left the chamber and then came back, and occupancy is charged for that. Their
    // own reversal entry restores them, which is what makes the totals reconcile. What must not
    // happen is a reversed challan being labelled a final outward movement.
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
      receivedBags: grn.bags,
      deliveredBags: 0,
      closingBags: grn.bags,
      smallBags: grn.smallBags,
      bigBags: grn.bigBags,
      remainingSmallBags: grn.smallBags,
      remainingBigBags: grn.bigBags,
      marks: grn.partyMark || grn.storageMark || grn.marks || null,
      gpNumber: grn.gpNumber ?? null,
      vehicleNumber: grn.vehicleNumber ?? null,
      remarks: grn.remarks ?? null,
      performedBy: grn.createdBy,
    },
  ];

  let runningBalance = grn.bags;
  let runningSmall = grn.smallBags;
  let runningBig = grn.bigBags;
  let netDelivered = 0;

  for (const item of timeline) {
    if (item.kind === 'CHALLAN') {
      const c = item.challan;
      const deliveredCount = c.smallBags + c.bigBags;
      const opening = runningBalance;
      const closing = Math.max(0, runningBalance - deliveredCount);
      const closingSmall = Math.max(0, runningSmall - c.smallBags);
      const closingBig = Math.max(0, runningBig - c.bigBags);
      runningBalance = closing;
      runningSmall = closingSmall;
      runningBig = closingBig;
      netDelivered += deliveredCount;
      const isLive = c.status === 'ISSUED';

      entries.push({
        date: c.date,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        // A reversed challan emptied the balance but did not settle it, so it is never the
        // final outward movement.
        type: isLive && closing === 0 ? 'FINAL_OUTWARD' : 'PARTIAL_OUTWARD',
        openingBags: opening,
        receivedBags: 0,
        deliveredBags: deliveredCount,
        closingBags: closing,
        smallBags: c.smallBags,
        bigBags: c.bigBags,
        remainingSmallBags: closingSmall,
        remainingBigBags: closingBig,
        challanNumber: c.challanNumber ?? null,
        deliveryId: c.id,
        marks: c.marks ?? grn.partyMark ?? grn.storageMark ?? grn.marks ?? null,
        gpNumber: c.gpNumber ?? grn.gpNumber ?? null,
        vehicleNumber: c.vehicleNumber ?? null,
        driverName: c.driverName ?? null,
        remarks: c.remarks ?? null,
        performedBy: c.issuedBy,
      });
    } else {
      const r = item.reversal;
      const originalChallan = challanMap.get(r.deliveryId);
      const returnedCount = originalChallan ? originalChallan.smallBags + originalChallan.bigBags : 0;
      const returnedSmall = originalChallan ? originalChallan.smallBags : 0;
      const returnedBig = originalChallan ? originalChallan.bigBags : 0;
      const opening = runningBalance;
      const closing = runningBalance + returnedCount;
      const closingSmall = runningSmall + returnedSmall;
      const closingBig = runningBig + returnedBig;
      runningBalance = closing;
      runningSmall = closingSmall;
      runningBig = closingBig;
      netDelivered -= returnedCount;

      entries.push({
        date: r.reversedAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: 'DELIVERY_REVERSAL',
        openingBags: opening,
        receivedBags: returnedCount,
        deliveredBags: returnedCount,
        closingBags: closing,
        smallBags: originalChallan?.smallBags ?? 0,
        bigBags: originalChallan?.bigBags ?? 0,
        remainingSmallBags: closingSmall,
        remainingBigBags: closingBig,
        challanNumber: r.challanNumber ?? null,
        reversalId: r.id,
        marks: grn.partyMark ?? grn.storageMark ?? grn.marks ?? null,
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
    originalSmallBags: grn.smallBags,
    originalBigBags: grn.bigBags,
    netDeliveredBags: Math.max(0, netDelivered),
    currentClosingBags: runningBalance,
    currentClosingSmallBags: runningSmall,
    currentClosingBigBags: runningBig,
    status: grn.status,
    entries,
  };
}
