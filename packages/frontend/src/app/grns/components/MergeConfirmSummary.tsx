'use client';

import React from 'react';
import type { OperationalBagType } from '@cold-storage/contracts';
import {
  formatRepackComposition,
  formatRepackHamali,
} from './mergeConfirmSummary.helper';
import styles from './MergeConfirmSummary.module.css';

export interface MergeConfirmSummaryProps {
  targetGrnNumber: string;
  targetCustomerName: string;
  sourceGrnNumbers: string[];
  totalSourceBags: number;
  resultingBagType: string;
  repackMode: boolean;
  actualRepackedBags: number;
  repackSmall: number | '';
  repackBig: number | '';
  repackBagType: OperationalBagType;
  commodityHamaliRate: number;
  repackHamaliCharge: number;
  settlementDecision: string;
  settleAmount: number;
  totalSourcePendingRent: number;
  totalConsolidatedBags?: number;
}

export function MergeConfirmSummary({
  targetGrnNumber,
  targetCustomerName,
  sourceGrnNumbers,
  totalSourceBags,
  resultingBagType,
  repackMode,
  actualRepackedBags,
  repackSmall,
  repackBig,
  repackBagType,
  commodityHamaliRate,
  repackHamaliCharge,
  settlementDecision: _settlementDecision,
  settleAmount: _settleAmount,
  totalSourcePendingRent,
  totalConsolidatedBags,
}: MergeConfirmSummaryProps) {
  const composition = formatRepackComposition(
    repackMode,
    repackBagType,
    repackSmall,
    repackBig,
    actualRepackedBags,
    totalSourceBags,
    totalConsolidatedBags,
  );
  const hamali = formatRepackHamali(repackHamaliCharge, actualRepackedBags, commodityHamaliRate);

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Please confirm the consignment consolidation and repacking details:
      </p>

      <div className={styles.detailsCard}>
        <div className={styles.grid}>
          <div className={styles.item}>
            <span className={styles.label}>Target GRN (Surviving)</span>
            <span className={styles.highlightValue}>
              {targetGrnNumber} ({targetCustomerName})
            </span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Source GRN(s) (Closing)</span>
            <span className={styles.value}>{sourceGrnNumbers.join(', ')}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Participating GRN Profiles</span>
            <span className={styles.value}>
              {1 + sourceGrnNumbers.length} Profiles (1 Destination + {sourceGrnNumbers.length} Source)
            </span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Resulting Bag Type</span>
            <span className={styles.value}>{resultingBagType}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Repacked Composition</span>
            <span className={styles.highlightValue}>{composition}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Repacking Labor Hamali</span>
            <span className={styles.value}>{hamali}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Settlement Bills (Step 3)</span>
            <span className={styles.value}>
              {totalSourcePendingRent > 0
                ? `₹${totalSourcePendingRent.toLocaleString('en-IN')} (Billed Separately per GRN)`
                : 'Fully Settled (₹0 Due)'}
            </span>
          </div>
        </div>
      </div>

      <p className={styles.warningNote}>
        Source GRNs will be permanently closed, stock combined, and this operation cannot be reversed.
      </p>
    </div>
  );
}
