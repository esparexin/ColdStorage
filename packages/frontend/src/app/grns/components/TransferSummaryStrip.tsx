'use client';

import React from 'react';
import { isHybridBagCategory, type Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

interface Props {
  currentGrn: Grn;
  remainingBags: number;
  totalPaid: number;
  pendingAmount: number;
  isUnbilled: boolean;
  rentLoading: boolean;
}

function formatBagCompositionSummary(grn: Grn, remainingBags: number): string {
  if (isHybridBagCategory(grn.bagType)) {
    return `${remainingBags} Bags (Hybrid: ${remainingBags})`;
  }
  if (grn.bagType === 'S') {
    return `${remainingBags} Bags (Small: ${remainingBags})`;
  }
  if (grn.bagType === 'B') {
    return `${remainingBags} Bags (Big: ${remainingBags})`;
  }
  const s = grn.smallBags;
  const b = grn.bigBags;
  if (typeof s === 'number' && typeof b === 'number' && (s > 0 || b > 0)) {
    if (s > 0 && b > 0) return `${remainingBags} Bags (Small: ${s}, Big: ${b})`;
    if (s > 0) return `${remainingBags} Bags (Small: ${s})`;
    if (b > 0) return `${remainingBags} Bags (Big: ${b})`;
  }
  return `${remainingBags} Bags (Bag Type: N/A)`;
}

export function TransferSummaryStrip({
  currentGrn, remainingBags, totalPaid, pendingAmount, isUnbilled, rentLoading,
}: Props) {
  return (
    <div className={styles.summaryStrip}>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Current Owner</span>
        <span className={styles.metaValue}>{currentGrn.customerName}</span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>GRN Number</span>
        <span className={styles.metaValue}>{currentGrn.grnNumber}</span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Inward Date</span>
        <span className={styles.metaValue}>{new Date(currentGrn.date).toLocaleDateString('en-IN')}</span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Commodity / Chamber</span>
        <span className={styles.metaValue}>{currentGrn.commodityName} (Ch. {currentGrn.chamber})</span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Total Bags</span>
        <span className={styles.metaValue}>{formatBagCompositionSummary(currentGrn, remainingBags)}</span>
      </div>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Rent State</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <span className={styles.metaValue}>
            {isUnbilled
              ? '₹0 due (At Outward / Dynamic)'
              : `₹${totalPaid.toLocaleString('en-IN')} paid / ₹${pendingAmount.toLocaleString('en-IN')} due`}
          </span>
          <Badge variant={isUnbilled ? 'neutral' : pendingAmount > 0 ? 'warning' : 'success'}>
            {rentLoading ? '...' : isUnbilled ? 'Unbilled' : pendingAmount > 0 ? 'Pending Dues' : 'Settled'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
