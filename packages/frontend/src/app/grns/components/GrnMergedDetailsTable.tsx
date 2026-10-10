'use client';

import React, { useMemo } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import styles from './GrnMergedDetailsTable.module.css';

interface GrnMergedDetailsTableProps {
  currentGrn: Grn;
  allGrns?: Grn[];
}

interface MergeTableRow {
  id: string;
  badgeLabel: string;
  badgeVariant: 'warning' | 'neutral' | 'success';
  date: string;
  grnLabel: string;
  refSub: string;
  partyName: string;
  partyMark: string;
  commodity: string;
  chamber: string;
  storageMark: string;
  totalBags: string;
  sbDetail: string;
  reason: string;
}

export function GrnMergedDetailsTable({ currentGrn, allGrns = [] }: GrnMergedDetailsTableProps) {
  const rows = useMemo<MergeTableRow[]>(() => {
    const list: MergeTableRow[] = [];
    const remarks = currentGrn.remarks ?? '';

    // 1. Check if current GRN received merged stock
    const mergeRx = /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags from (?:GRN\s+)?([^\s(]+)(?:\s*\(([^)]+)\))?\.\s*Reason:\s*([^\]]+)\]/gi;
    let match: RegExpExecArray | null;
    while ((match = mergeRx.exec(remarks)) !== null) {
      const [, date, bagsStr, sourceGrnNum, detailsStr, reason] = match;
      const sourceGrn = allGrns.find((g) => g.grnNumber === sourceGrnNum);
      const custMatch = detailsStr?.match(/Customer:\s*([^,]+)/i);
      const party = sourceGrn?.customerName || (custMatch ? custMatch[1].trim() : 'N/A');
      const partyMark = sourceGrn?.partyMark ? `PM: ${sourceGrn.partyMark}` : 'PM: N/A';
      const chamber = sourceGrn?.chamber ? `Chamber: ${sourceGrn.chamber}` : currentGrn.chamber ? `Chamber: ${currentGrn.chamber}` : 'Chamber: N/A';
      const storageMark = sourceGrn?.storageMark ? `SM: ${sourceGrn.storageMark}` : `SM: ${sourceGrnNum}`;
      const smallBags = sourceGrn?.smallBags != null ? sourceGrn.smallBags.toLocaleString('en-IN') : 'N/A';
      const bigBags = sourceGrn?.bigBags != null ? sourceGrn.bigBags.toLocaleString('en-IN') : Number(bagsStr).toLocaleString('en-IN');
      const bagType = sourceGrn?.bagType ?? currentGrn.bagType ?? 'S/B';

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
        sbDetail: `S: ${smallBags} • B: ${bigBags} (${bagType})`,
        reason: reason?.trim() || 'N/A',
      });
    }

    // 2. Check if current GRN itself was merged into a surviving target
    if (currentGrn.mergedIntoGrnNumber) {
      const targetGrn = allGrns.find(
        (g) => g.grnNumber === currentGrn.mergedIntoGrnNumber || g.id === currentGrn.mergedIntoGrnId,
      );
      const dateStr = new Date(currentGrn.date).toISOString().slice(0, 10);
      const smallBags = currentGrn.smallBags != null ? currentGrn.smallBags.toLocaleString('en-IN') : 'N/A';
      const bigBags = currentGrn.bigBags != null ? currentGrn.bigBags.toLocaleString('en-IN') : currentGrn.bags.toLocaleString('en-IN');
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
        storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
        totalBags: `${currentGrn.bags.toLocaleString('en-IN')} bags`,
        sbDetail: `S: ${smallBags} • B: ${bigBags} (${bagType})`,
        reason: 'Merged into surviving target lot',
      });
    }

    // 3. Check ownership transfer events
    const ownRx = /\[OWNERSHIP TRANSFERRED on ([^:]+):\s*from\s+([^(]+)(?:\s*\([^)]*\))?\s+to\s+([^(]+)(?:\s*\([^)]*\))?\.\s*(?:[^.]*\.\s*)?Reason:\s*([^\]]+)\]/gi;
    let ownMatch: RegExpExecArray | null;
    while ((ownMatch = ownRx.exec(remarks)) !== null) {
      const [, date, fromParty, toParty, reason] = ownMatch;
      const smallBags = currentGrn.smallBags != null ? currentGrn.smallBags.toLocaleString('en-IN') : 'N/A';
      const bigBags = currentGrn.bigBags != null ? currentGrn.bigBags.toLocaleString('en-IN') : currentGrn.bags.toLocaleString('en-IN');
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
        storageMark: currentGrn.storageMark ? `SM: ${currentGrn.storageMark}` : `SM: ${currentGrn.grnNumber}`,
        totalBags: `${currentGrn.bags.toLocaleString('en-IN')} bags`,
        sbDetail: `S: ${smallBags} • B: ${bigBags} (${bagType})`,
        reason: reason?.trim() || 'N/A',
      });
    }

    return list;
  }, [currentGrn, allGrns]);

  if (rows.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Internal Move & Merged Lot History</span>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Type & Date</th>
              <th className={styles.th}>GRN # / Ref</th>
              <th className={styles.th}>Party & Mark</th>
              <th className={styles.th}>Commodity</th>
              <th className={styles.th}>Location</th>
              <th className={`${styles.th} ${styles.thRight}`}>S & B Details</th>
              <th className={styles.th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={styles.tr}>
                <td className={styles.td}>
                  <Badge variant={row.badgeVariant}>{row.badgeLabel}</Badge>
                  <span className={styles.subText}>{row.date}</span>
                </td>
                <td className={styles.td}>
                  <span className={`${styles.primaryText} ${styles.tabularNum}`}>{row.grnLabel}</span>
                  <span className={styles.subText}>{row.refSub}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.primaryText}>{row.partyName}</span>
                  <span className={styles.subText}>{row.partyMark}</span>
                </td>
                <td className={styles.td}>
                  <span>{row.commodity}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.primaryText}>{row.chamber}</span>
                  <span className={styles.subText}>{row.storageMark}</span>
                </td>
                <td className={`${styles.td} ${styles.tdRight}`}>
                  <span className={`${styles.primaryText} ${styles.tabularNum}`}>{row.totalBags}</span>
                  <span className={styles.subText}>{row.sbDetail}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.reasonNote}>{row.reason}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
