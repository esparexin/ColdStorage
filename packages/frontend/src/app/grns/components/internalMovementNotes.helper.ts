/**
 * internalMovementNotes.helper — SSOT parser and transformer for internal
 * movement history and merged GRN notes across GRN & Rent domains.
 */

import { isHybridBagCategory, type Grn, type InternalMovementRecord } from '@cold-storage/contracts';

export interface MergedGrnNote {
  id: string; title: string; date: string; bags: number; repackedDetail?: string; source: string;
  carriedRent: number; reason: string;
}

export interface MergeTableRow {
  id: string; badgeLabel: string; badgeVariant: 'warning' | 'neutral' | 'success'; date: string;
  grnLabel: string; refSub: string; partyName: string; partyMark: string;
  commodity: string; chamber: string; storageMark: string; totalBags: string;
  sbDetail: string; reason: string;
}

export function parseMergedGrnNotes(remarks?: string | null): MergedGrnNote[] {
  if (!remarks) return [];
  const mergeRx =
    /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags(.*?)\s+from\s+([^.]+)\.(?:[^.]*Carried pending rent:\s*₹?(\d+)\.)?\s*Reason:\s*([^\]]+)\]/gi;
  const notes: MergedGrnNote[] = [];
  let match: RegExpExecArray | null;
  while ((match = mergeRx.exec(remarks)) !== null) {
    const [, date, bagsStr, qualifiers, source, carriedRentStr, reason] = match;
    const repackedMatch = qualifiers ? qualifiers.match(/Repacked:[^)]+/i) : null;
    notes.push({
      id: `merge-${date.trim()}-${source.trim().replace(/\s+/g, '-')}`,
      title: 'Merged Stock Inward',
      date: date.trim(),
      bags: Number(bagsStr),
      repackedDetail: repackedMatch ? repackedMatch[0].trim() : undefined,
      source: source.trim(),
      carriedRent: carriedRentStr ? Number(carriedRentStr) : 0,
      reason: reason?.trim() || 'Internal Move / Merge',
    });
  }
  return notes;
}

export function parseRemarksToTableRows(currentGrn: Grn, allGrns: Grn[] = []): MergeTableRow[] {
  const list: MergeTableRow[] = [];
  const remarks = currentGrn.remarks ?? '';

  // 1. Check if current GRN received merged stock
  const mergeRx =
    /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags(.*?)\s+from\s+(?:GRN\s+)?([^\s(]+)(?:\s*\(([^)]+)\))?\.(?:[^.]*\.)?\s*Reason:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = mergeRx.exec(remarks)) !== null) {
    const [, date, bagsStr, , sourceGrnNum, detailsStr, reason] = match;
    const sourceGrn = allGrns.find((g) => g.grnNumber === sourceGrnNum);
    const custMatch = detailsStr?.match(/Customer:\s*([^,]+)/i);
    const party = sourceGrn?.customerName || (custMatch ? custMatch[1].trim() : 'N/A');
    const partyMark = sourceGrn?.partyMark ? `PM: ${sourceGrn.partyMark}` : 'PM: N/A';
    const chamber = sourceGrn?.chamber ? `Chamber: ${sourceGrn.chamber}` : currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A';
    const storageMark = sourceGrn?.storageMark ? `SM: ${sourceGrn.storageMark}` : `SM: ${sourceGrnNum}`;
    const bagType = sourceGrn?.bagType ?? currentGrn.bagType ?? 'S/B';

    const repackedMatch = match[0].match(/Repacked:\s*(\d+)\s*S\s*\+\s*(\d+)\s*B/i);
    const hamaliMatch = match[0].match(/Repacking Hamali:\s*₹?(\d+)(?:\s*\(([^)]+)\))?/i);
    const hamaliNote = hamaliMatch ? ` • Hamali: ₹${hamaliMatch[1]} (${hamaliMatch[2]})` : '';
    const isSourceHybrid = sourceGrn && ((sourceGrn.bagPrice != null && sourceGrn.smallBagPrice == null && sourceGrn.bigBagPrice == null) || isHybridBagCategory(sourceGrn.bagType));
    let sbDetail: string;
    if (repackedMatch) {
      sbDetail = `Repacked: ${repackedMatch[1]} S • ${repackedMatch[2]} B (${bagType})${hamaliNote}`;
    } else if (isSourceHybrid) {
      sbDetail = `Hybrid (${bagType})${hamaliNote}`;
    } else if (sourceGrn && (sourceGrn.smallBags > 0 || sourceGrn.bigBags > 0)) {
      sbDetail = `S: ${sourceGrn.smallBags.toLocaleString('en-IN')} • B: ${sourceGrn.bigBags.toLocaleString('en-IN')} (${bagType})${hamaliNote}`;
    } else {
      sbDetail = `S: Unconfirmed • B: Unconfirmed (${bagType})${hamaliNote}`;
    }

    list.push({
      id: `merge-in-${sourceGrnNum}-${date}`,
      badgeLabel: '📥 Merge In',
      badgeVariant: 'success',
      date,
      grnLabel: `From: ${sourceGrnNum}`,
      refSub: 'Inward Merge',
      partyName: party,
      partyMark,
      commodity: sourceGrn?.commodityName || currentGrn.commodityName || 'N/A',
      chamber,
      storageMark,
      totalBags: `+${Number(bagsStr).toLocaleString('en-IN')} bags`,
      sbDetail,
      reason: reason?.trim() || 'N/A',
    });
  }

  // 2. Check if current GRN itself was merged into a surviving target
  if (currentGrn.mergedIntoGrnNumber) {
    const targetGrn = allGrns.find(
      (g) => g.grnNumber === currentGrn.mergedIntoGrnNumber || g.id === currentGrn.mergedIntoGrnId,
    );
    const mergeOutRx =
      /\[MERGED into (?:GRN\s+)?([^\s]+)\s+on\s+([^:]+):(?:\s*(?:.*?)(?:Reason:\s*([^\]]+)))?\]/i;
    const mergeOutMatch = remarks.match(mergeOutRx);
    const dateStr = mergeOutMatch
      ? mergeOutMatch[2].trim()
      : currentGrn.updatedAt
        ? new Date(currentGrn.updatedAt).toISOString().slice(0, 10)
        : new Date(currentGrn.date).toISOString().slice(0, 10);
    const reason = mergeOutMatch?.[3]?.trim() || 'Merged into surviving target lot';
    const smallBags = currentGrn.smallBags != null ? currentGrn.smallBags.toLocaleString('en-IN') : 'N/A';
    const bigBags =
      currentGrn.bigBags != null
        ? currentGrn.bigBags.toLocaleString('en-IN')
        : currentGrn.bags.toLocaleString('en-IN');
    const bagType = currentGrn.bagType ?? 'S/B';

    list.push({
      id: `merge-out-${currentGrn.grnNumber}`,
      badgeLabel: '📤 Merged Out',
      badgeVariant: 'neutral',
      date: dateStr,
      grnLabel: `Into: ${currentGrn.mergedIntoGrnNumber}`,
      refSub: `Surviving: ${targetGrn?.customerName || 'N/A'}`,
      partyName: currentGrn.customerName || 'N/A',
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
      commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark
        ? `SM: ${currentGrn.storageMark}`
        : `SM: ${currentGrn.storageMark || currentGrn.grnNumber}`,
      totalBags: `${currentGrn.bags.toLocaleString('en-IN')} bags`,
      sbDetail: `S: ${smallBags} • B: ${bigBags} (${bagType})`,
      reason,
    });
  }

  // 3. Check ownership transfer events
  const ownRx =
    /\[OWNERSHIP TRANSFERRED on ([^:]+):\s*from\s+([^(]+)(?:\s*\([^)]*\))?\s+to\s+([^(]+)(?:\s*\([^)]*\))?\.\s*(?:[^.]*\.\s*)?Reason:\s*([^\]]+)\]/gi;
  let ownMatch: RegExpExecArray | null;
  while ((ownMatch = ownRx.exec(remarks)) !== null) {
    const [, date, fromParty, toParty, reason] = ownMatch;
    const smallBags = currentGrn.smallBags != null ? currentGrn.smallBags.toLocaleString('en-IN') : 'N/A';
    const bigBags =
      currentGrn.bigBags != null
        ? currentGrn.bigBags.toLocaleString('en-IN')
        : currentGrn.bags.toLocaleString('en-IN');
    const bagType = currentGrn.bagType ?? 'S/B';

    list.push({
      id: `own-transfer-${date}`,
      badgeLabel: '👤 Transfer',
      badgeVariant: 'warning',
      date,
      grnLabel: currentGrn.grnNumber,
      refSub: 'Ownership Change',
      partyName: `${fromParty.trim()} → ${toParty.trim()}`,
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
      commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark
        ? `SM: ${currentGrn.storageMark}`
        : `SM: ${currentGrn.storageMark || currentGrn.grnNumber}`,
      totalBags: `${currentGrn.bags.toLocaleString('en-IN')} bags`,
      sbDetail: `S: ${smallBags} • B: ${bigBags} (${bagType})`,
      reason: reason?.trim() || 'N/A',
    });
  }

  return list;
}

export function mapStructuredMovementsToTableRows(
  movements: InternalMovementRecord[],
  currentGrn: Grn,
  allGrns: Grn[] = [],
): MergeTableRow[] {
  return movements.map((rec) => {
    const dateStr = rec.movementDate ? new Date(rec.movementDate).toISOString().slice(0, 10) : 'N/A';
    const bagType = currentGrn.bagType ?? 'S/B';
    const isHybrid = (currentGrn.bagPrice != null && currentGrn.smallBagPrice == null && currentGrn.bigBagPrice == null) || isHybridBagCategory(currentGrn.bagType);
    const hamaliSuffix = rec.hamaliCharge && rec.hamaliCharge > 0
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
