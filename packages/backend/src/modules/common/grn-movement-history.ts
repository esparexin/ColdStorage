import type { GrnMovementEntry, GrnMovementHistory } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';

export async function getGrnMovementHistory(
  facilityId: string,
  grnId: string,
): Promise<GrnMovementHistory | null> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) return null;

  const [challans, reversals, internalMovements] = await Promise.all([
    DeliveryChallanModel.find({ grnId, facilityId }).lean().exec(),
    DeliveryReversalModel.find({ grnId, facilityId }).lean().exec(),
    InternalMovementModel.find({
      facilityId,
      $or: [{ targetGrnId: grnId }, { sourceGrnIds: grnId }, { grnId }],
    }).lean().exec(),
  ]);

  const challanMap = new Map(challans.map((c) => [c.id, c]));

  type MovementItem =
    | { kind: 'CHALLAN'; date: Date; createdAt: Date; challan: (typeof challans)[0] }
    | { kind: 'REVERSAL'; date: Date; createdAt: Date; reversal: (typeof reversals)[0] }
    | { kind: 'INTERNAL'; date: Date; createdAt: Date; movement: (typeof internalMovements)[0] };

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
    ...internalMovements.map((m) => ({
      kind: 'INTERNAL' as const,
      date: m.movementDate,
      createdAt: m.createdAt,
      movement: m,
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
    } else if (item.kind === 'REVERSAL') {
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
    } else {
      const m = item.movement;
      if (m.movementType === 'MERGE') {
        if (m.targetGrnId === grn.id) {
          const opening = runningBalance;
          const closing = runningBalance + m.totalBagsMoved;
          runningBalance = closing;
          runningSmall += m.smallBagsMoved;
          runningBig += m.bigBagsMoved;
          entries.push({
            date: m.movementDate,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            type: 'INTERNAL_MERGE_IN',
            openingBags: opening,
            receivedBags: m.totalBagsMoved,
            deliveredBags: 0,
            closingBags: closing,
            smallBags: m.smallBagsMoved,
            bigBags: m.bigBagsMoved,
            remainingSmallBags: runningSmall,
            remainingBigBags: runningBig,
            remarks: `Merged from ${m.sourceGrnNumbers.join(', ')}: ${m.remarks || ''}`,
            performedBy: m.performedBy,
          });
        } else if (m.sourceGrnIds.includes(grn.id)) {
          const opening = runningBalance;
          entries.push({
            date: m.movementDate,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            type: 'INTERNAL_MERGE_OUT',
            openingBags: opening,
            receivedBags: 0,
            deliveredBags: opening,
            closingBags: 0,
            smallBags: runningSmall,
            bigBags: runningBig,
            remainingSmallBags: 0,
            remainingBigBags: 0,
            remarks: `Merged into GRN ${m.targetGrnNumber}: ${m.remarks || ''}`,
            performedBy: m.performedBy,
          });
          runningBalance = 0;
          runningSmall = 0;
          runningBig = 0;
        }
      } else if (m.movementType === 'TRANSFER_OWNERSHIP') {
        entries.push({
          date: m.movementDate,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          type: 'OWNERSHIP_TRANSFER',
          openingBags: runningBalance,
          receivedBags: 0,
          deliveredBags: 0,
          closingBags: runningBalance,
          remainingSmallBags: runningSmall,
          remainingBigBags: runningBig,
          remarks: `Ownership transferred: ${m.fromCustomerName} → ${m.toCustomerName}: ${m.remarks || ''}`,
          performedBy: m.performedBy,
        });
      }
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
    bondNumber: grn.bondNumber ?? null,
    isBondForLoan: grn.isBondForLoan ?? false,
    loanStatus: grn.loanStatus ?? 'NONE',
    isLoanHoldActive: grn.loanStatus === 'TAKEN',
    loanBankName: grn.loanBankName ?? null,
    loanReferenceNumber: grn.loanReferenceNumber ?? null,
    entries,
  };
}
