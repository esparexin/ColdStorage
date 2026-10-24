import type { Grn } from '@cold-storage/contracts';
import { getLoanStatusDisplay } from '../../../lib/loanStatusFormat';

export interface MergedDetailItem {
  grnNumber: string;
  bags: number;
  chamber?: string | null;
  storageMark?: string | null;
  partyMark?: string | null;
}

export function cleanRemarks(remarks?: string | null): string {
  return (remarks ?? '')
    .replace(/\[(MERGE RECEIVED|MERGED into|OWNERSHIP TRANSFERRED)[^\]]*\]/gi, '')
    .trim();
}

export function extractMergedDetails(grn: Grn, allGrns: Grn[] = []): MergedDetailItem[] {
  const list: MergedDetailItem[] = [];
  const seenGrnNumbers = new Set<string>();

  // 1. Parse merge records from remarks — this contains the exact bags transferred
  const remarks = grn.remarks ?? '';
  const mergeRx = /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags from (?:GRN\s+)?([^\s(]+)(?:\s*\(([^)]+)\))?\.\s*Reason:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = mergeRx.exec(remarks)) !== null) {
    const [, , bagsStr, sourceGrnNum] = match;
    if (!seenGrnNumbers.has(sourceGrnNum)) {
      seenGrnNumbers.add(sourceGrnNum);
      const sourceGrn = allGrns.find((g) => g.grnNumber === sourceGrnNum);
      list.push({
        grnNumber: sourceGrnNum,
        bags: Number(bagsStr) || 0,
        chamber: sourceGrn?.chamber || null,
        storageMark: sourceGrn?.storageMark || sourceGrnNum,
        partyMark: sourceGrn?.partyMark || null,
      });
    }
  }

  // 1b. Also parse multi-source structured remark written by merge-grn.handler:
  // e.g. [MERGE RECEIVED on 2026-10-22: +60 bags (Repacked: 30 S + 30 B = 60 bags)... from GRN 0010 (... Bags: 10 ...); GRN 0012 (... Bags: 12 ...)]
  if (remarks.includes('[MERGE RECEIVED')) {
    const sourceRx = /GRN\s+([A-Za-z0-9-]+)\s*\([^)]*?Bags:\s*(\d+)/gi;
    let sm: RegExpExecArray | null;
    while ((sm = sourceRx.exec(remarks)) !== null) {
      const sourceGrnNum = sm[1];
      const sourceBags = Number(sm[2]) || 0;
      if (!seenGrnNumbers.has(sourceGrnNum)) {
        seenGrnNumbers.add(sourceGrnNum);
        const sourceGrn = allGrns.find((g) => g.grnNumber === sourceGrnNum);
        list.push({
          grnNumber: sourceGrnNum,
          bags: sourceBags,
          chamber: sourceGrn?.chamber || null,
          storageMark: sourceGrn?.storageMark || sourceGrnNum,
          partyMark: sourceGrn?.partyMark || null,
        });
      }
    }
  }

  // 2. Also check allGrns for any merged source lots not captured in remarks
  for (const g of allGrns) {
    if (
      (g.mergedIntoGrnNumber === grn.grnNumber || (g.mergedIntoGrnId && g.mergedIntoGrnId === grn.id)) &&
      !seenGrnNumbers.has(g.grnNumber)
    ) {
      seenGrnNumbers.add(g.grnNumber);
      list.push({
        grnNumber: g.grnNumber,
        bags: g.bags,
        chamber: g.chamber || null,
        storageMark: g.storageMark || g.grnNumber,
        partyMark: g.partyMark || null,
      });
    }
  }

  return list;
}

export function getLoanBadgeInfo(grn: Grn, hasMerged: boolean): {
  isBonded: boolean;
  variant: 'danger' | 'success' | 'neutral';
  text: string;
  bondNumberDisplay: string;
} {
  const isBonded = Boolean(grn.isBondForLoan || (grn.loanStatus && grn.loanStatus !== 'NONE'));
  const statusDisplay = getLoanStatusDisplay(isBonded ? grn.loanStatus : 'NONE');

  const bondNumberDisplay = hasMerged
    ? grn.grnNumber
    : isBonded
      ? (grn.bondNumber || grn.grnNumber)
      : 'None';

  return {
    isBonded,
    variant: statusDisplay.variant,
    text: statusDisplay.label,
    bondNumberDisplay,
  };
}

export function deriveMergedAttributes(
  grn: Grn,
  mergedDetails: MergedDetailItem[],
): {
  mergedChambers: string[];
  mergedStorageMarks: string[];
  mergedPartyMarks: string[];
  bagsBreakdown: string | null;
} {
  const chamberSet = new Set<string>();
  const storageMarkSet = new Set<string>();
  const partyMarkSet = new Set<string>();

  for (const m of mergedDetails) {
    if (m.chamber && m.chamber !== grn.chamber) {
      chamberSet.add(m.chamber);
    }
    const mark = m.storageMark || m.grnNumber;
    if (mark && mark !== grn.grnNumber) {
      storageMarkSet.add(mark);
    }
    if (m.partyMark && m.partyMark !== grn.partyMark) {
      partyMarkSet.add(m.partyMark);
    }
  }

  const totalMergedBags = mergedDetails.reduce((sum, m) => sum + (m.bags || 0), 0);
  const activeInitialBags = Math.max(0, grn.bags - totalMergedBags);
  const bagsBreakdown =
    mergedDetails.length === 0 || totalMergedBags === 0
      ? null
      : `${activeInitialBags.toLocaleString('en-IN')} + ${totalMergedBags.toLocaleString('en-IN')}`;

  return {
    mergedChambers: Array.from(chamberSet),
    mergedStorageMarks: Array.from(storageMarkSet),
    mergedPartyMarks: Array.from(partyMarkSet),
    bagsBreakdown,
  };
}
