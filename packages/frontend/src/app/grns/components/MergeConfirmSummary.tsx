'use client';

import React from 'react';
import {
  formatRepackComposition,
  formatRepackHamali,
  formatRepackVariance,
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
  repackBagType: 'S/B' | 'Hybrid';
  commodityHamaliRate: number;
  repackHamaliCharge: number;
  settlementDecision: string;
  settleAmount: number;
  totalSourcePendingRent: number;
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
  settlementDecision,
  settleAmount,
  totalSourcePendingRent,
}: MergeConfirmSummaryProps) {
  const variance = formatRepackVariance(repackMode, actualRepackedBags, totalSourceBags);
  const composition = formatRepackComposition(
    repackMode,
    repackBagType,
    repackSmall,
    repackBig,
    actualRepackedBags,
    totalSourceBags,
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
            <span className={styles.label}>Resulting Bag Type</span>
            <span className={styles.value}>{resultingBagType}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Repacked Composition</span>
            <span className={styles.highlightValue}>{composition}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Repack Net Variance</span>
            <span className={variance.isLoss ? styles.warningValue : styles.value}>
              {variance.text}
            </span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Repacking Labor Hamali</span>
            <span className={styles.value}>{hamali}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Rent Settlement Gate</span>
            <span className={styles.value}>
              {settlementDecision === 'SETTLE_NOW'
                ? settleAmount < totalSourcePendingRent
                  ? `₹${settleAmount.toLocaleString('en-IN')} Settled Now / ₹${(totalSourcePendingRent - settleAmount).toLocaleString('en-IN')} Carried Forward`
                  : `₹${settleAmount.toLocaleString('en-IN')} Settled Now (Pay Now)`
                : `₹${totalSourcePendingRent.toLocaleString('en-IN')} Carried Forward (Pay Later)`}
            </span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Original Source Pool</span>
            <span className={styles.value}>{totalSourceBags} Bags</span>
          </div>
        </div>
      </div>

      <p className={styles.warningNote}>
        Source GRNs will be permanently closed, stock combined, and this operation cannot be reversed.
      </p>
    </div>
  );
}
