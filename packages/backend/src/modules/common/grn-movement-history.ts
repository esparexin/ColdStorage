import {
  resolveStoredCompositionVerified,
  type GrnMovementEntry,
  type GrnMovementHistory,
} from '@cold-storage/contracts';
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
    InternalMovementModel.find({ facilityId, grnId, movementType: 'TRANSFER_OWNERSHIP' }).lean().exec(),
  ]);

  const challanIds = txs.filter((t) => t.referenceType === 'DELIVERY').map((t) => t.referenceId);
  const reversalIds = txs.filter((t) => t.referenceType === 'DELIVERY_REVERSAL').map((t) => t.referenceId);
  const getMovId = (refId: string) => refId.replace(new RegExp(`-${grn.id}$`), '');
  const movRefIds = [
    ...txs.filter((t) => t.referenceType === 'PUT_AWAY' && t.referenceId !== grn.id && !t.referenceId.startsWith('mov-')).map((t) => t.referenceId),
    ...txs.filter((t) => t.referenceId.startsWith('mov-')).map((t) => getMovId(t.referenceId)),
  ];

  const [challans, reversals, referencedMovs] = await Promise.all([
    challanIds.length ? DeliveryChallanModel.find({ id: { $in: challanIds }, facilityId }).lean().exec() : [],
    reversalIds.length ? DeliveryReversalModel.find({ id: { $in: reversalIds }, facilityId }).lean().exec() : [],
    movRefIds.length ? InternalMovementModel.find({ id: { $in: movRefIds }, facilityId }).lean().exec() : [],
  ]);

  const challanMap = new Map(challans.map((c) => [c.id, c]));
  const reversalMap = new Map(reversals.map((r) => [r.id, r]));
  const movRefMap = new Map(referencedMovs.map((m) => [m.id, m]));

  const genesisTx = txs.find((t) => t.referenceType === 'PUT_AWAY' && t.referenceId === grn.id);
  const subsequentTxs = txs.filter((t) => t !== genesisTx);
  const isGenesisVerified = resolveStoredCompositionVerified({
    isCompositionVerified: grn.isCompositionVerified, bagType: grn.bagType,
    bags: grn.bags, smallBags: grn.smallBags, bigBags: grn.bigBags,
  });

  const initialTotal = genesisTx ? genesisTx.smallQuantity + genesisTx.bigQuantity : grn.bags;
  const initialSmall = isGenesisVerified
    ? (grn.bagType === 'S' ? initialTotal : grn.bagType === 'B' ? 0 : (genesisTx ? genesisTx.smallQuantity : grn.smallBags))
    : null;
  const initialBig = isGenesisVerified
    ? (grn.bagType === 'B' ? initialTotal : grn.bagType === 'S' ? 0 : (genesisTx ? genesisTx.bigQuantity : grn.bigBags))
    : null;

  let runningBalance = initialTotal;
  let runningSmall: number | null = initialSmall;
  let runningBig: number | null = initialBig;
  let netDelivered = 0;

  const entries: GrnMovementEntry[] = [
    {
      date: grn.date, grnId: grn.id, grnNumber: grn.grnNumber, type: 'INWARD',
      openingBags: 0, receivedBags: initialTotal, deliveredBags: 0, closingBags: initialTotal,
      smallBags: initialSmall, bigBags: initialBig, remainingSmallBags: initialSmall, remainingBigBags: initialBig,
      marks: grn.partyMark || grn.storageMark || grn.marks || null,
      gpNumber: grn.gpNumber ?? null, vehicleNumber: grn.vehicleNumber ?? null, remarks: grn.remarks ?? null, performedBy: grn.createdBy,
    },
  ];

  type TimelineItem =
    | { kind: 'TX'; tx: (typeof txs)[0] }
    | { kind: 'OWNERSHIP'; movement: (typeof ownershipMovements)[0] };

  const referencedMovIdSet = new Set(txs.map((t) => getMovId(t.referenceId)));
  const unrepresentedOwnershipMovements = ownershipMovements.filter((m) => !referencedMovIdSet.has(m.id));
  const timeline: TimelineItem[] = [
    ...subsequentTxs.map((tx) => ({ kind: 'TX' as const, tx })),
    ...unrepresentedOwnershipMovements.map((movement) => ({ kind: 'OWNERSHIP' as const, movement })),
  ];

  const getEventTime = (item: TimelineItem): number => {
    if (item.kind === 'OWNERSHIP') return new Date(item.movement.movementDate ?? item.movement.createdAt).getTime();
    const t = item.tx;
    if (t.referenceType === 'DELIVERY') {
      const c = challanMap.get(t.referenceId);
      if (c?.date) return new Date(c.date).getTime();
    }
    const m = movRefMap.get(t.referenceId) ?? movRefMap.get(getMovId(t.referenceId));
    return m?.movementDate ? new Date(m.movementDate).getTime() : new Date(t.createdAt).getTime();
  };

  const isInternalAdjustmentOut = (t: (typeof txs)[0]) =>
    t.transactionType === 'OUTWARD_DELIVERY' &&
    !challanMap.has(t.referenceId) &&
    (Boolean(t.notes?.toLowerCase().includes('repack')) ||
      Boolean(t.notes?.toLowerCase().includes('ownership transfer')) ||
      movRefMap.get(getMovId(t.referenceId))?.movementType === 'REPACK' ||
      movRefMap.get(getMovId(t.referenceId))?.movementType === 'TRANSFER_OWNERSHIP');

  const getOpTime = (item: TimelineItem): number => {
    if (item.kind === 'OWNERSHIP') return new Date(item.movement.createdAt ?? item.movement.movementDate).getTime();
    const t = item.tx;
    const m = movRefMap.get(t.referenceId) ?? movRefMap.get(getMovId(t.referenceId));
    if (m?.createdAt) return new Date(m.createdAt).getTime();
    const ref = challanMap.get(t.referenceId) ?? reversalMap.get(t.referenceId);
    if (ref?.createdAt) return new Date(ref.createdAt).getTime();
    const d = new Date(t.createdAt).getTime();
    return d % 86400000 !== 0 ? d : (t as { _id?: { getTimestamp?: () => Date } })._id?.getTimestamp?.()?.getTime() ?? d;
  };

  timeline.sort((a, b) => {
    const dayDiff = getEventTime(a) - getEventTime(b);
    if (dayDiff !== 0) return dayDiff;
    const opDiff = getOpTime(a) - getOpTime(b);
    if (opDiff !== 0) return opDiff;
    const prio = (i: TimelineItem) =>
      i.kind === 'OWNERSHIP' ? 2 : isInternalAdjustmentOut(i.tx) ? 0 : i.tx.transactionType === 'INWARD_PUTAWAY' ? 1 : 3;
    return prio(a) - prio(b);
  });

  for (const item of timeline) {
    if (item.kind === 'OWNERSHIP') {
      const m = item.movement;
      entries.push({
        date: m.movementDate, grnId: grn.id, grnNumber: grn.grnNumber, type: 'OWNERSHIP_TRANSFER',
        openingBags: runningBalance, receivedBags: 0, deliveredBags: 0, closingBags: runningBalance,
        remainingSmallBags: runningSmall, remainingBigBags: runningBig,
        remarks: `Ownership transferred: ${m.fromCustomerName} → ${m.toCustomerName}: ${m.remarks || ''}`, performedBy: m.performedBy,
      });
      continue;
    }

    const t = item.tx;
    const deltaTotal = t.smallQuantity + t.bigQuantity;
    const opening = runningBalance;

    if (t.transactionType === 'INWARD_PUTAWAY') {
      runningBalance += deltaTotal;
      if (runningSmall != null && runningBig != null) {
        runningSmall += t.smallQuantity;
        runningBig += t.bigQuantity;
      }

      const mov = movRefMap.get(t.referenceId);
      const isMergeIn = mov?.movementType === 'MERGE' || Boolean(t.notes?.startsWith('Merged'));
      const isTransferIn = mov?.movementType === 'TRANSFER_OWNERSHIP' ||
        (!challanMap.has(t.referenceId) && Boolean(t.notes?.toLowerCase().includes('ownership transfer')));
      const isRepack = !isMergeIn && !isTransferIn &&
        (mov?.movementType === 'REPACK' || (!challanMap.has(t.referenceId) && Boolean(t.notes?.toLowerCase().includes('repack'))));
      if (isRepack || isTransferIn) {
        runningSmall = t.smallQuantity;
        runningBig = t.bigQuantity;
      }
      const trfInNotes = isTransferIn && mov?.movementType === 'TRANSFER_OWNERSHIP'
        ? `Ownership transferred: ${mov.fromCustomerName} → ${mov.toCustomerName}: ${t.notes || ''}`
        : t.notes;
      entries.push({
        date: mov?.movementDate ?? t.createdAt, grnId: grn.id, grnNumber: grn.grnNumber,
        type: isRepack ? 'INTERNAL_REPACK' : isTransferIn ? 'OWNERSHIP_TRANSFER' : 'INTERNAL_MERGE_IN',
        openingBags: opening, receivedBags: deltaTotal, deliveredBags: 0, closingBags: runningBalance,
        smallBags: t.smallQuantity, bigBags: t.bigQuantity, remainingSmallBags: runningSmall, remainingBigBags: runningBig,
        remarks: trfInNotes, performedBy: mov?.performedBy ?? t.createdBy,
      });
    } else if (t.transactionType === 'OUTWARD_DELIVERY') {
      const isMergeOut = t.notes?.startsWith('Merged into');
      const mov = movRefMap.get(getMovId(t.referenceId));
      const isTransferOut = mov?.movementType === 'TRANSFER_OWNERSHIP' ||
        (!challanMap.has(t.referenceId) && Boolean(t.notes?.toLowerCase().includes('ownership transfer')));
      const isRepack = !isTransferOut &&
        (mov?.movementType === 'REPACK' || (!challanMap.has(t.referenceId) && Boolean(t.notes?.includes('repack'))));
      const closing = Math.max(0, runningBalance - deltaTotal);
      let closingSmall: number | null = null;
      let closingBig: number | null = null;
      if (closing === 0) {
        closingSmall = closingBig = runningSmall = runningBig = 0;
      } else if (runningSmall != null && runningBig != null) {
        closingSmall = runningSmall = Math.max(0, runningSmall - t.smallQuantity);
        closingBig = runningBig = Math.max(0, runningBig - t.bigQuantity);
      }
      runningBalance = closing;
      if (!isRepack && !isMergeOut && !isTransferOut) netDelivered += deltaTotal;

      if (isMergeOut || isRepack || isTransferOut) {
        const trfOutNotes = isTransferOut && mov?.movementType === 'TRANSFER_OWNERSHIP'
          ? `Ownership transferred: ${mov.fromCustomerName} → ${mov.toCustomerName}: ${t.notes || ''}`
          : t.notes;
        entries.push({
          date: mov?.movementDate ?? t.createdAt, grnId: grn.id, grnNumber: grn.grnNumber,
          type: isMergeOut ? 'INTERNAL_MERGE_OUT' : isRepack ? 'INTERNAL_REPACK' : 'OWNERSHIP_TRANSFER',
          openingBags: opening, receivedBags: 0, deliveredBags: deltaTotal, closingBags: isMergeOut || isTransferOut || isRepack ? 0 : closing,
          smallBags: t.smallQuantity, bigBags: t.bigQuantity,
          remainingSmallBags: isMergeOut || isTransferOut || isRepack ? 0 : closingSmall, remainingBigBags: isMergeOut || isTransferOut || isRepack ? 0 : closingBig,
          remarks: trfOutNotes, performedBy: mov?.performedBy ?? t.createdBy,
        });
      } else {
        const challan = challanMap.get(t.referenceId);
        const isLive = challan?.status === 'ISSUED';
        entries.push({
          date: challan?.date ?? t.createdAt, grnId: grn.id, grnNumber: grn.grnNumber,
          type: isLive && closing === 0 ? 'FINAL_OUTWARD' : 'PARTIAL_OUTWARD',
          openingBags: opening, receivedBags: 0, deliveredBags: deltaTotal, closingBags: closing,
          smallBags: t.smallQuantity, bigBags: t.bigQuantity, remainingSmallBags: closingSmall, remainingBigBags: closingBig,
          challanNumber: challan?.challanNumber ?? null, deliveryId: challan?.id ?? t.referenceId,
          marks: challan?.marks ?? grn.partyMark ?? grn.storageMark ?? grn.marks ?? null,
          gpNumber: challan?.gpNumber ?? grn.gpNumber ?? null, vehicleNumber: challan?.vehicleNumber ?? null,
          driverName: challan?.driverName ?? null, remarks: challan?.remarks ?? t.notes ?? null, performedBy: challan?.issuedBy ?? t.createdBy,
        });
      }
    } else if (t.transactionType === 'DELIVERY_REVERSAL') {
      const reversal = reversalMap.get(t.referenceId);
      const closing = runningBalance + deltaTotal;
      let closingSmall: number | null = null;
      let closingBig: number | null = null;
      if (runningSmall != null && runningBig != null) {
        closingSmall = runningSmall = runningSmall + t.smallQuantity;
        closingBig = runningBig = runningBig + t.bigQuantity;
      }
      runningBalance = closing;
      netDelivered = Math.max(0, netDelivered - deltaTotal);

      entries.push({
        date: reversal?.reversedAt ?? t.createdAt, grnId: grn.id, grnNumber: grn.grnNumber,
        type: 'DELIVERY_REVERSAL', openingBags: opening, receivedBags: deltaTotal, deliveredBags: deltaTotal,
        closingBags: closing, smallBags: t.smallQuantity, bigBags: t.bigQuantity,
        remainingSmallBags: closingSmall, remainingBigBags: closingBig,
        challanNumber: reversal?.challanNumber ?? null, reversalId: reversal?.id ?? t.referenceId,
        marks: grn.partyMark ?? grn.storageMark ?? grn.marks ?? null, gpNumber: grn.gpNumber ?? null,
        remarks: reversal?.reason ?? t.notes ?? null, performedBy: reversal?.reversedBy ?? t.createdBy,
      });
    }
  }

  return {
    grnId: grn.id, facilityId: grn.facilityId, grnNumber: grn.grnNumber,
    customerId: grn.customerId, customerName: grn.customerName, commodityId: grn.commodityId, commodityName: grn.commodityName,
    chamber: grn.chamber, inwardDate: grn.date, totalInwardBags: initialTotal,
    originalSmallBags: isGenesisVerified ? (initialSmall ?? undefined) : undefined,
    originalBigBags: isGenesisVerified ? (initialBig ?? undefined) : undefined,
    netDeliveredBags: Math.max(0, netDelivered), currentClosingBags: runningBalance,
    currentClosingSmallBags: runningSmall != null ? runningSmall : (runningBalance === 0 ? 0 : undefined),
    currentClosingBigBags: runningBig != null ? runningBig : (runningBalance === 0 ? 0 : undefined),
    status: grn.status, bondNumber: grn.bondNumber ?? null, isBondForLoan: grn.isBondForLoan ?? false,
    loanStatus: grn.loanStatus ?? 'NONE', isLoanHoldActive: grn.loanStatus === 'TAKEN',
    loanBankName: grn.loanBankName ?? null, loanReferenceNumber: grn.loanReferenceNumber ?? null,
    entries,
  };
}
