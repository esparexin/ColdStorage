/**
 * internalMovementNotes.helper — SSOT parser and transformer for internal
 * movement history and merged GRN notes across GRN & Rent domains.
 */

import { isHybridBagCategory, type Grn } from '@cold-storage/contracts';
export { mapStructuredMovementsToTableRows } from './structuredMovementsTable.helper';

export interface MergedGrnNote {
  id: string; title: string; date: string; bags: number; repackedDetail?: string; source: string;
  carriedRent: number; separateSourceRent: number; reason: string;
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
    /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags(.*?)\s+from\s+([\s\S]*?)(?:\.\s*Reason:|\s*Reason:)\s*([^\]\n]+)\]?/gi;
  const notes: MergedGrnNote[] = [];
  let match: RegExpExecArray | null;
  while ((match = mergeRx.exec(remarks)) !== null) {
    const [, date, bagsStr, qualifiers, sourceAndNotes, reason] = match;
    const repackedMatch = qualifiers ? qualifiers.match(/Repacked:[^)]+/i) : null;
    const carriedMatch = sourceAndNotes.match(/(?:Carried pending rent|Additional rent):\s*₹?(\d+)/i);
    const separateMatch = sourceAndNotes.match(
      /Source pending rent:\s*₹?(\d+)\s*kept as separate pending bills/i,
    );
    const cleanSource = sourceAndNotes
      .replace(/\.?\s*(?:Carried pending rent|Additional rent):\s*₹?\d+/i, '')
      .replace(/\.?\s*Source pending rent:\s*₹?\d+\s*kept as separate pending bills/i, '')
      .trim();

    notes.push({
      id: `merge-${date.trim()}-${cleanSource.slice(0, 30).replace(/\s+/g, '-')}`,
      title: 'Merged Stock Inward',
      date: date.trim(),
      bags: Number(bagsStr),
      repackedDetail: repackedMatch ? repackedMatch[0].trim() : undefined,
      source: cleanSource,
      carriedRent: carriedMatch ? Number(carriedMatch[1]) : 0,
      separateSourceRent: separateMatch ? Number(separateMatch[1]) : 0,
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
    /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags(.*?)\s+from\s+(?:GRN\s+)?([^\s(]+)(?:\s*\(([^)]+)\))?\.(?:[^.]*\.)?\s*Reason:\s*([^\]\n]+)\]?/gi;
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
    const isSourceHybrid =
      (sourceGrn &&
        ((sourceGrn.bagPrice != null && sourceGrn.smallBagPrice == null && sourceGrn.bigBagPrice == null) ||
          isHybridBagCategory(sourceGrn.bagType))) ||
      bagType === 'Hybrid' ||
      isHybridBagCategory(bagType) ||
      match[0].includes('[Hybrid') ||
      match[0].includes('(Hybrid');

    const sourceSbMatch = match[0].match(/\[Small\s*[-:]\s*(\d+)[,\s]*Big\s*[-:]\s*(\d+)\]/i);

    let sbDetail: string;
    if (repackedMatch) {
      sbDetail = `Repacked: ${repackedMatch[1]} S • ${repackedMatch[2]} B (${bagType})${hamaliNote}`;
    } else if (isSourceHybrid) {
      sbDetail = `Hybrid${hamaliNote}`;
    } else if (sourceSbMatch) {
      sbDetail = `S: ${Number(sourceSbMatch[1]).toLocaleString('en-IN')} • B: ${Number(sourceSbMatch[2]).toLocaleString('en-IN')} (${bagType})${hamaliNote}`;
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
    const bagType = currentGrn.bagType ?? 'S/B';
    const hybridMatch = remarks.match(/cleared\s*\((?:Confirmed\s+)?Hybrid(?:\s*-\s*(\d+))?\)/i);
    const sbMatch = remarks.match(
      /cleared\s*\((?:Small\s*[-:]\s*(\d+)[,\s]*Big\s*[-:]\s*(\d+)|S:\s*(\d+)\s*•\s*B:\s*(\d+))(?:,\s*BagType:\s*([^)]+))?\)/i,
    );

    let sbDetail = 'Hybrid';
    if (!hybridMatch && bagType !== 'Hybrid' && !isHybridBagCategory(bagType)) {
      if (sbMatch) {
        const sVal = sbMatch[1] ?? sbMatch[3];
        const bVal = sbMatch[2] ?? sbMatch[4];
        sbDetail = `S: ${Number(sVal).toLocaleString('en-IN')} • B: ${Number(bVal).toLocaleString('en-IN')} (${sbMatch[5]?.trim() || bagType})`;
      } else {
        const s = currentGrn.smallBags != null ? currentGrn.smallBags.toLocaleString('en-IN') : 'N/A';
        const b = currentGrn.bigBags != null ? currentGrn.bigBags.toLocaleString('en-IN') : currentGrn.bags.toLocaleString('en-IN');
        sbDetail = `S: ${s} • B: ${b} (${bagType})`;
      }
    }

    list.push({
      id: `merge-out-${currentGrn.grnNumber}`, badgeLabel: '📤 Merged Out', badgeVariant: 'neutral',
      date: dateStr, grnLabel: `Into: ${currentGrn.mergedIntoGrnNumber}`,
      refSub: `Surviving: ${targetGrn?.customerName || 'N/A'}`, partyName: currentGrn.customerName || 'N/A',
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A', commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.storageMark || currentGrn.grnNumber}`,
      totalBags: `${currentGrn.bags.toLocaleString('en-IN')} bags`, sbDetail, reason,
    });
  }

  // 3. Check ownership transfer events
  const ownRx =
    /\[OWNERSHIP TRANSFERRED on ([^:]+):\s*([\s\S]*?)from\s+([^(]+)(?:\s*\([^)]*\))?\s+to\s+([^(]+)(?:\s*\([^)]*\))?\.\s*(?:[^.]*\.\s*)?Reason:\s*([^\]\n]+)\]?/gi;
  let ownMatch: RegExpExecArray | null;
  while ((ownMatch = ownRx.exec(remarks)) !== null) {
    const [, date, qualifiers, fromParty, toParty, reason] = ownMatch;

    const bagsMatch = qualifiers?.match(/\+(\d+)\s*bags/i);
    const sbMatch = qualifiers?.match(/\(S:\s*(\d+)\s*•\s*B:\s*(\d+)(?:,\s*BagType:\s*([^)]+))?\)/i);
    const hybridMatch = qualifiers?.match(/\(Hybrid\)/i);
    const invoiceMatch = qualifiers?.match(/Invoice:\s*#([^\s]+)/i);
    const feeMatch = qualifiers?.match(/Transfer Fee:\s*₹?(\d+(?:\.\d+)?)(?:\s*\(([^)]+)\))?/i);

    const totalBags = bagsMatch ? `${Number(bagsMatch[1]).toLocaleString('en-IN')} bags` : 'Transferred bags';
    const feeSuffix = feeMatch ? ` • Fee: ₹${feeMatch[1]}${feeMatch[2] ? ` (${feeMatch[2]})` : ''}` : '';

    let sbDetail: string;
    if (hybridMatch) {
      sbDetail = `Hybrid${feeSuffix}`;
    } else if (sbMatch) {
      const bagTypeLabel = sbMatch[3] ? ` (${sbMatch[3].trim()})` : '';
      sbDetail = `S: ${Number(sbMatch[1]).toLocaleString('en-IN')} • B: ${Number(sbMatch[2]).toLocaleString('en-IN')}${bagTypeLabel}${feeSuffix}`;
    } else {
      sbDetail = `Composition recorded in DB${feeSuffix}`;
    }

    const invoiceNumber = invoiceMatch ? invoiceMatch[1].trim() : null;

    list.push({
      id: `own-transfer-${date.trim()}`,
      badgeLabel: '👤 Transfer',
      badgeVariant: 'warning',
      date: date.trim(),
      grnLabel: invoiceNumber ? `#${invoiceNumber}` : currentGrn.grnNumber,
      refSub: invoiceNumber ? currentGrn.grnNumber : 'Ownership Change',
      partyName: `${fromParty.trim()} → ${toParty.trim()}`,
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
      commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark
        ? `SM: ${currentGrn.storageMark}`
        : `SM: ${currentGrn.storageMark || currentGrn.grnNumber}`,
      totalBags,
      sbDetail,
      reason: reason?.trim() || 'Ownership Transfer',
    });
  }

  // 4. Check sorting & repacking events
  const repackRx =
    /\[SORTED & REPACKED on ([^:]+):\s*(\d+)(?:\s*bags(?:\s*\([^)]*\))?)?\s*➔\s*([\s\S]*?)Inv:?\s*#([^\s|]+)(?:[\s\S]*?Service:\s*₹?(\d+(?:\.\d+)?))?(?:[\s\S]*?\|\s*([^\]]+))?\]/gi;
  let repackMatch: RegExpExecArray | null;
  while ((repackMatch = repackRx.exec(remarks)) !== null) {
    const [, date, originalBagsStr, details, invoiceNum, serviceFee, customReason] = repackMatch;
    const bagsMatch = details.match(/(\d+)\s*bags/i);
    const repackedBags = bagsMatch ? Number(bagsMatch[1]) : Number(originalBagsStr);
    const varianceMatch = details.match(/Variance:\s*([+-]?\d+)\s*bags/i);
    const varianceStr = varianceMatch ? ` (Variance: ${varianceMatch[1]} bags)` : '';
    const serviceSuffix = serviceFee ? ` • Service: ₹${serviceFee}` : '';
    const sbMatch = details.match(/\(S:\s*(\d+)\s*•\s*B:\s*(\d+)(?:,\s*BagType:\s*([^)]+))?\)/i);
    const isHybrid = details.includes('(Hybrid') || isHybridBagCategory(currentGrn.bagType);
    let sbDetail: string;
    if (isHybrid) {
      sbDetail = `Hybrid${serviceSuffix}`;
    } else if (sbMatch) {
      const bagTypeLabel = sbMatch[3] ? ` (${sbMatch[3].trim()})` : '';
      sbDetail = `S: ${Number(sbMatch[1]).toLocaleString('en-IN')} • B: ${Number(sbMatch[2]).toLocaleString('en-IN')}${bagTypeLabel}${serviceSuffix}`;
    } else {
      sbDetail = `Repacked stock${serviceSuffix}`;
    }

    list.push({
      id: `repack-${date.trim()}-${invoiceNum.trim()}`,
      badgeLabel: '🔄 Repack',
      badgeVariant: 'neutral',
      date: date.trim(),
      grnLabel: `#${invoiceNum.trim()}`,
      refSub: currentGrn.grnNumber,
      partyName: currentGrn.customerName || 'N/A',
      partyMark: currentGrn.partyMark ? `PM: ${currentGrn.partyMark}` : 'PM: N/A',
      commodity: currentGrn.commodityName || 'N/A',
      chamber: currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A',
      storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
      totalBags: `${repackedBags.toLocaleString('en-IN')} bags${varianceStr}`,
      sbDetail, reason: customReason?.trim() || 'Sorted & Repacked Lot',
    });
  }

  return list;
}
