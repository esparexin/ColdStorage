import {
  appendGrnRemarks,
  isHybridBagCategory,
  type BagType,
  type MergeGrnInput,
} from '@cold-storage/contracts';

export interface BuildMergeTargetUpdatesParams {
  destinationChamber: string;
  resultingBagType: BagType;
  newBags: number;
  newSmall: number;
  newBig: number;
  newIsCompositionVerified: boolean;
  newRentAmount: number;
  moveDate: Date;
  actualMovedBags: number;
  totalMovedBags: number;
  totalMovedSmall: number;
  totalMovedBig: number;
  repackVariance: number;
  repackHamaliCharge: number;
  repackHamaliBags: number;
  repackHamaliRate: number;
  finalCarriedRent: number;
  totalSourcePendingRent: number;
  sourceSummaries: string[];
  mergeInvoiceNumber: string;
  targetGrn: {
    remarks?: string | null;
    storageMark?: string | null;
    partyMark?: string | null;
  };
  input: MergeGrnInput;
}

export function buildMergeTargetUpdates(params: BuildMergeTargetUpdatesParams): {
  targetNote: string;
  updatedTargetRemarks: string;
  targetUpdateFields: Record<string, unknown>;
} {
  const {
    destinationChamber,
    resultingBagType,
    newBags,
    newSmall,
    newBig,
    newIsCompositionVerified,
    newRentAmount,
    moveDate,
    actualMovedBags,
    totalMovedBags,
    totalMovedSmall,
    totalMovedBig,
    repackVariance,
    repackHamaliCharge,
    repackHamaliBags,
    repackHamaliRate,
    finalCarriedRent,
    totalSourcePendingRent,
    sourceSummaries,
    mergeInvoiceNumber,
    targetGrn,
    input,
  } = params;

  const moveDateStr = moveDate.toISOString().split('T')[0];
  const varianceNote =
    repackVariance !== 0
      ? `; Variance from ${totalMovedBags} source bags: ${repackVariance > 0 ? `+${repackVariance}` : repackVariance} bags`
      : '';
  const repackedNote =
    input.repackedSmallBags != null
      ? ` (Repacked: ${totalMovedSmall} S + ${totalMovedBig} B = ${actualMovedBags} bags${varianceNote})`
      : '';
  const repackHamaliNote =
    repackHamaliCharge > 0
      ? `. Repacking Hamali: ₹${repackHamaliCharge} (${repackHamaliBags} bags @ ₹${repackHamaliRate}/bag)`
      : '';
  const categoryNote =
    input.sourceBagCategory != null && isHybridBagCategory(input.sourceBagCategory)
      ? ` (Confirmed Hybrid: ${actualMovedBags} bags${varianceNote})`
      : '';
  const carriedRentNote = finalCarriedRent > 0 ? `. Additional rent: ₹${finalCarriedRent}` : '';
  const sourceBillsNote =
    totalSourcePendingRent > 0
      ? `. Source pending rent: ₹${totalSourcePendingRent} kept as separate pending bills`
      : '';
  const activeSubNote = '. Active subscription continued for consolidated stock';
  const inwardHistoryNote = `. Consolidated stock new inward date: ${moveDateStr}`;
  const invoiceRef = mergeInvoiceNumber ? ` (#${mergeInvoiceNumber})` : '';

  const targetNote = `[MERGE RECEIVED on ${moveDateStr}${invoiceRef}: +${actualMovedBags} bags${repackedNote}${repackHamaliNote}${categoryNote} from ${sourceSummaries.join('; ')}${carriedRentNote}${sourceBillsNote}${activeSubNote}${inwardHistoryNote}. Reason: ${input.remarks.trim()}]`;
  const updatedTargetRemarks = appendGrnRemarks(targetGrn.remarks, targetNote);

  const isHybrid = resultingBagType === 'Hybrid' || isHybridBagCategory(resultingBagType);
  const targetUpdateFields: Record<string, unknown> = {
    chamber: destinationChamber,
    bagType: resultingBagType,
    bags: newBags,
    smallBags: isHybrid ? 0 : newSmall,
    bigBags: isHybrid ? 0 : newBig,
    isCompositionVerified: newIsCompositionVerified,
    rentAmount: newRentAmount,
    mergedAt: moveDate,
    remarks: updatedTargetRemarks,
    updatedAt: new Date(),
  };

  if (input.partyMark?.trim()) targetUpdateFields.partyMark = input.partyMark.trim();
  if (input.storageMark?.trim()) targetUpdateFields.storageMark = input.storageMark.trim();
  const combinedMarks = [input.storageMark?.trim() || targetGrn.storageMark, input.partyMark?.trim() || targetGrn.partyMark]
    .filter(Boolean)
    .join(' / ');
  if (combinedMarks && (input.partyMark?.trim() || input.storageMark?.trim())) {
    targetUpdateFields.marks = combinedMarks;
  }

  return { targetNote, updatedTargetRemarks, targetUpdateFields };
}
