'use client';

import React from 'react';
import { AlertCircle, Check, CheckCircle2, Clock, GitMerge } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui/Badge';
import styles from './GrnTable.module.css';

interface GrnLifecycleStatusCellProps {
  row: Grn;
}

export function GrnLifecycleStatusCell({ row }: GrnLifecycleStatusCellProps) {
  if (row.mergedIntoGrnNumber || row.mergedIntoGrnId) {
    return (
      <div className={styles.statusGroup}>
        <Badge variant="neutral" icon={<GitMerge size={11} aria-hidden="true" />}>
          Merged
        </Badge>
        {row.mergedIntoGrnNumber && (
          <span className={styles.mergedReference}>Merged → {row.mergedIntoGrnNumber}</span>
        )}
      </div>
    );
  }

  const isMergedTarget = Boolean(row.remarks && row.remarks.includes('[MERGE RECEIVED'));

  if (row.status === 'CLOSED') {
    return (
      <div className={styles.statusGroup}>
        <Badge variant="neutral" icon={<Check size={11} aria-hidden="true" />}>
          Closed
        </Badge>
        {isMergedTarget && <span className={styles.mergedReference}>Merged Lot</span>}
      </div>
    );
  }

  const delivered = row.netDeliveredBags ?? 0;
  const remaining = row.closingBags ?? Math.max(0, row.bags - delivered);

  if (delivered === 0) {
    return (
      <div className={styles.statusGroup}>
        <Badge variant="success" icon={<CheckCircle2 size={11} aria-hidden="true" />}>
          Active
        </Badge>
        {isMergedTarget && <span className={styles.mergedReference}>Merged Lot</span>}
      </div>
    );
  }

  if (remaining > 0) {
    return (
      <div className={styles.statusGroup}>
        <Badge variant="warning" icon={<Clock size={11} aria-hidden="true" />}>
          Partial
        </Badge>
        {isMergedTarget && <span className={styles.mergedReference}>Merged Lot</span>}
      </div>
    );
  }

  return (
    <div className={styles.statusGroup}>
      <Badge variant="danger" icon={<AlertCircle size={11} aria-hidden="true" />}>
        Pending Payment
      </Badge>
      {isMergedTarget && <span className={styles.mergedReference}>Merged Lot</span>}
    </div>
  );
}
