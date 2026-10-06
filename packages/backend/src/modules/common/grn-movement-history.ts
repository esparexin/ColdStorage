import type { GrnMovementEntry, GrnMovementHistory } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';

export async function getGrnMovementHistory(
  facilityId: string,
  grnId: string,
): Promise<GrnMovementHistory | null> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) return null;

  const [txs, ownershipMovements] = await Promise.all([
    InventoryTransactionModel.find({ facilityId, grnId }).sort({ createdAt: 1 }).lean().exec(),
    InternalMovementModel.find({ facilityId, grnId, movementType: 'TRANSFER_OWNERSHIP' })
      .lean()
      .exec(),
  ]);

  const challanIds = txs.filter((t) => t.referenceType === 'DELIVERY').map((t) => t.referenceId);
  const reversalIds = txs
    .filter((t) => t.referenceType === 'DELIVERY_REVERSAL')
    .map((t) => t.referenceId);

  const [challans, reversals] = await Promise.all([
    challanIds.length
      ? DeliveryChallanModel.find({ id: { $in: challanIds }, facilityId }).lean().exec()
      : [],
    reversalIds.length
      ? DeliveryReversalModel.find({ id: { $in: reversalIds }, facilityId }).lean().exec()
      : [],
  ]);

  const challanMap = new Map(challans.map((c) => [c.id, c]));
  const reversalMap = new Map(reversals.map((r) => [r.id, r]));

  // The initial INWARD transaction is the genesis record for this GRN.
  const genesisTx = txs.find((t) => t.referenceType === 'PUT_AWAY' && t.referenceId === grn.id);
  const subsequentTxs = txs.filter((t) => t !== genesisTx);

  const initialSmall = genesisTx ? genesisTx.smallQuantity : grn.smallBags;
  const initialBig = genesisTx ? genesisTx.bigQuantity : grn.bigBags;
  const initialTotal = genesisTx ? genesisTx.smallQuantity + genesisTx.bigQuantity : grn.bags;

  let runningBalance = initialTotal;
  let runningSmall = initialSmall;
  let runningBig = initialBig;
  let netDelivered = 0;

  const entries: GrnMovementEntry[] = [
    {
      date: grn.date,
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      type: 'INWARD',
      openingBags: 0,
      receivedBags: initialTotal,
      deliveredBags: 0,
      closingBags: initialTotal,
      smallBags: initialSmall,
      bigBags: initialBig,
      remainingSmallBags: initialSmall,
      remainingBigBags: initialBig,
      marks: grn.partyMark || grn.storageMark || grn.marks || null,
      gpNumber: grn.gpNumber ?? null,
      vehicleNumber: grn.vehicleNumber ?? null,
      remarks: grn.remarks ?? null,
      performedBy: grn.createdBy,
    },
  ];

  type TimelineItem =
    | { kind: 'TX'; createdAt: Date; tx: (typeof txs)[0] }
    | { kind: 'OWNERSHIP'; createdAt: Date; movement: (typeof ownershipMovements)[0] };

  const timeline: TimelineItem[] = [
    ...subsequentTxs.map((t) => ({ kind: 'TX' as const, createdAt: t.createdAt, tx: t })),
    ...ownershipMovements.map((m) => ({
      kind: 'OWNERSHIP' as const,
      createdAt: m.createdAt,
      movement: m,
    })),
  ];
  timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const item of timeline) {
    if (item.kind === 'OWNERSHIP') {
      const m = item.movement;
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
      continue;
    }

    const t = item.tx;
    const deltaTotal = t.smallQuantity + t.bigQuantity;
    const opening = runningBalance;

    if (t.transactionType === 'INWARD_PUTAWAY') {
      runningBalance += deltaTotal;
      runningSmall += t.smallQuantity;
      runningBig += t.bigQuantity;

      entries.push({
        date: t.createdAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: 'INTERNAL_MERGE_IN',
        openingBags: opening,
        receivedBags: deltaTotal,
        deliveredBags: 0,
        closingBags: runningBalance,
        smallBags: t.smallQuantity,
        bigBags: t.bigQuantity,
        remainingSmallBags: runningSmall,
        remainingBigBags: runningBig,
        remarks: t.notes,
        performedBy: t.createdBy,
      });
    } else if (t.transactionType === 'OUTWARD_DELIVERY') {
      const isMergeOut = t.notes?.startsWith('Merged into');
      const closing = Math.max(0, runningBalance - deltaTotal);
      const closingSmall = Math.max(0, runningSmall - t.smallQuantity);
      const closingBig = Math.max(0, runningBig - t.bigQuantity);
      runningBalance = closing;
      runningSmall = closingSmall;
      runningBig = closingBig;
      netDelivered += deltaTotal;

      if (isMergeOut) {
        entries.push({
          date: t.createdAt,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          type: 'INTERNAL_MERGE_OUT',
          openingBags: opening,
          receivedBags: 0,
          deliveredBags: deltaTotal,
          closingBags: 0,
          smallBags: t.smallQuantity,
          bigBags: t.bigQuantity,
          remainingSmallBags: 0,
          remainingBigBags: 0,
          remarks: t.notes,
          performedBy: t.createdBy,
        });
      } else {
        const challan = challanMap.get(t.referenceId);
        const isLive = challan?.status === 'ISSUED';
        entries.push({
          date: challan?.date ?? t.createdAt,
          grnId: grn.id,
          grnNumber: grn.grnNumber,
          type: isLive && closing === 0 ? 'FINAL_OUTWARD' : 'PARTIAL_OUTWARD',
          openingBags: opening,
          receivedBags: 0,
          deliveredBags: deltaTotal,
          closingBags: closing,
          smallBags: t.smallQuantity,
          bigBags: t.bigQuantity,
          remainingSmallBags: closingSmall,
          remainingBigBags: closingBig,
          challanNumber: challan?.challanNumber ?? null,
          deliveryId: challan?.id ?? t.referenceId,
          marks: challan?.marks ?? grn.partyMark ?? grn.storageMark ?? grn.marks ?? null,
          gpNumber: challan?.gpNumber ?? grn.gpNumber ?? null,
          vehicleNumber: challan?.vehicleNumber ?? null,
          driverName: challan?.driverName ?? null,
          remarks: challan?.remarks ?? t.notes ?? null,
          performedBy: challan?.issuedBy ?? t.createdBy,
        });
      }
    } else if (t.transactionType === 'DELIVERY_REVERSAL') {
      const reversal = reversalMap.get(t.referenceId);
      const closing = runningBalance + deltaTotal;
      const closingSmall = runningSmall + t.smallQuantity;
      const closingBig = runningBig + t.bigQuantity;
      runningBalance = closing;
      runningSmall = closingSmall;
      runningBig = closingBig;
      netDelivered = Math.max(0, netDelivered - deltaTotal);

      entries.push({
        date: reversal?.reversedAt ?? t.createdAt,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        type: 'DELIVERY_REVERSAL',
        openingBags: opening,
        receivedBags: deltaTotal,
        deliveredBags: deltaTotal,
        closingBags: closing,
        smallBags: t.smallQuantity,
        bigBags: t.bigQuantity,
        remainingSmallBags: closingSmall,
        remainingBigBags: closingBig,
        challanNumber: reversal?.challanNumber ?? null,
        reversalId: reversal?.id ?? t.referenceId,
        marks: grn.partyMark ?? grn.storageMark ?? grn.marks ?? null,
        gpNumber: grn.gpNumber ?? null,
        remarks: reversal?.reason ?? t.notes ?? null,
        performedBy: reversal?.reversedBy ?? t.createdBy,
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
    bondNumber: grn.bondNumber ?? null,
    isBondForLoan: grn.isBondForLoan ?? false,
    loanStatus: grn.loanStatus ?? 'NONE',
    isLoanHoldActive: grn.loanStatus === 'TAKEN',
    loanBankName: grn.loanBankName ?? null,
    loanReferenceNumber: grn.loanReferenceNumber ?? null,
    entries,
  };
}
