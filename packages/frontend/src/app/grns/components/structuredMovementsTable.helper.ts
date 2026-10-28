/**
 * structuredMovementsTable.helper — Maps structured InternalMovementRecord
 * entries into MergeTableRow items for UI rendering in GrnMergedDetailsTable.
 */

import { isHybridBagCategory, type Grn, type InternalMovementRecord } from '@cold-storage/contracts';
import type { MergeTableRow } from './internalMovementNotes.helper';

export function mapStructuredMovementsToTableRows(
  movements: InternalMovementRecord[],
  currentGrn: Grn,
  allGrns: Grn[] = [],
): MergeTableRow[] {
  return movements.map((rec) => {
    const dateStr = rec.movementDate ? new Date(rec.movementDate).toISOString().slice(0, 10) : 'N/A';
    const bagType = currentGrn.bagType ?? 'S/B';
    const isHybrid =
      (currentGrn.bagPrice != null && currentGrn.smallBagPrice == null && currentGrn.bigBagPrice == null) ||
      isHybridBagCategory(currentGrn.bagType);
    const hamaliSuffix =
      rec.hamaliCharge && rec.hamaliCharge > 0
        ? ` • Hamali: ₹${rec.hamaliCharge}${rec.hamaliRate ? ` (@₹${rec.hamaliRate}/bag)` : ''}`
        : '';
    const baseSb = isHybrid
      ? `Hybrid (${bagType})`
      : rec.smallBagsMoved > 0 || rec.bigBagsMoved > 0
      ? `S: ${rec.smallBagsMoved.toLocaleString('en-IN')} • B: ${rec.bigBagsMoved.toLocaleString('en-IN')} (${bagType})`
      : `${rec.totalBagsMoved.toLocaleString('en-IN')} bags (${bagType})`;
    const sbDetail = `${baseSb}${hamaliSuffix}`;

    if (rec.movementType === 'MERGE') {
      const isTarget = rec.targetGrnId === currentGrn.id;
      if (isTarget) {
        const sourceLabel = rec.sourceGrnNumbers?.length ? rec.sourceGrnNumbers.join(', ') : 'Source Lots';
        const firstSourceGrn = rec.sourceGrnNumbers?.[0]
          ? allGrns.find((g) => g.grnNumber === rec.sourceGrnNumbers[0])
          : undefined;
        return {
          id: rec.id,
          badgeLabel: '📥 Merge In',
          badgeVariant: 'success',
          date: dateStr,
          grnLabel: `From: ${sourceLabel}`,
          refSub: 'Inward Merge',
          partyName: firstSourceGrn?.customerName || currentGrn.customerName || 'N/A',
          partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
          commodity: currentGrn.commodityName || 'N/A',
          chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
          storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
          totalBags: `+${rec.totalBagsMoved.toLocaleString('en-IN')} bags`,
          sbDetail,
          reason: rec.remarks?.trim() || 'Consolidation Merge',
        };
      } else {
        return {
          id: rec.id,
          badgeLabel: '📤 Merged Out',
          badgeVariant: 'neutral',
          date: dateStr,
          grnLabel: `Into: ${rec.targetGrnNumber || 'Surviving Lot'}`,
          refSub: 'Target Lot',
          partyName: currentGrn.customerName || 'N/A',
          partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
          commodity: currentGrn.commodityName || 'N/A',
          chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
          storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
          totalBags: `${rec.totalBagsMoved.toLocaleString('en-IN')} bags`,
          sbDetail,
          reason: rec.remarks?.trim() || 'Merged into surviving target lot',
        };
      }
    }

    return {
      id: rec.id,
      badgeLabel: '👤 Transfer',
      badgeVariant: 'warning',
      date: dateStr,
      grnLabel: rec.grnNumber || currentGrn.grnNumber,
      refSub: 'Ownership Change',
      partyName: `${rec.fromCustomerName || 'Previous Owner'} → ${rec.toCustomerName || 'New Owner'}`,
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
      commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
      totalBags: `${(rec.totalBagsMoved || currentGrn.bags).toLocaleString('en-IN')} bags`,
      sbDetail,
      reason: rec.remarks?.trim() || 'Ownership Transfer',
    };
  });
}
