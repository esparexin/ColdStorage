'use client';

import React from 'react';
import { AlertCircle, Check, CheckCircle2, Clock, GitMerge } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui/Badge';
import { resolveGrnLifecycleStatus } from './grnLifecycleStatus.helper';
import styles from './GrnTable.module.css';

interface GrnLifecycleStatusCellProps {
  row: Grn;
}

export function GrnLifecycleStatusCell({ row }: GrnLifecycleStatusCellProps) {
  const status = resolveGrnLifecycleStatus(row);
  const icon =
    status.icon === 'GitMerge' ? (
      <GitMerge size={11} aria-hidden="true" />
    ) : status.icon === 'CheckCircle2' ? (
      <CheckCircle2 size={11} aria-hidden="true" />
    ) : status.icon === 'Clock' ? (
      <Clock size={11} aria-hidden="true" />
    ) : status.icon === 'AlertCircle' ? (
      <AlertCircle size={11} aria-hidden="true" />
    ) : (
      <Check size={11} aria-hidden="true" />
    );

  return (
    <div className={styles.statusGroup}>
      <Badge variant={status.variant} icon={icon}>
        {status.badge}
      </Badge>
      {status.mergedReference && (
        <span className={styles.mergedReference}>{status.mergedReference}</span>
      )}
      {status.isMergedLot && <span className={styles.mergedReference}>Merged Lot</span>}
    </div>
  );
}
