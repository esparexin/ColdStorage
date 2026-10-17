'use client';

import React, { useMemo } from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import {
  cleanRemarks,
  deriveMergedAttributes,
  extractMergedDetails,
  getLoanBadgeInfo,
} from './grnDetailModal.helper';
import styles from '../page.module.css';

interface GrnDetailAttributesGridProps {
  grn: Grn;
  allGrns?: Grn[];
}

export function GrnDetailAttributesGrid({ grn, allGrns = [] }: GrnDetailAttributesGridProps) {
  const mergedDetails = useMemo(() => extractMergedDetails(grn, allGrns), [grn, allGrns]);
  const hasMerged = mergedDetails.length > 0;
  const loanInfo = useMemo(() => getLoanBadgeInfo(grn, hasMerged), [grn, hasMerged]);
  const cleanedRemarks = useMemo(() => cleanRemarks(grn.remarks), [grn.remarks]);
  const { mergedChambers, mergedStorageMarks, mergedPartyMarks, bagsBreakdown } = useMemo(
    () => deriveMergedAttributes(grn, mergedDetails),
    [grn, mergedDetails],
  );

  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Inward Date</span>
        <span className={styles.detailValue}>
          {new Date(grn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Physical Status</span>
        <span className={styles.detailValue}>
          <Badge variant={grn.status === 'OPEN' ? 'warning' : 'neutral'}>{grn.status}</Badge>
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Bond Number</span>
        <span className={styles.detailValue}>
          {loanInfo.bondNumberDisplay !== 'None' ? (
            <strong style={{ color: 'var(--color-primary-text)' }}>{loanInfo.bondNumberDisplay}</strong>
          ) : (
            'None'
          )}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Loan Status</span>
        <span className={styles.detailValue}>
          <Badge variant={loanInfo.variant}>{loanInfo.text}</Badge>
          {grn.loanStatus === 'TAKEN' && grn.loanTakenAt && (
            <span className={styles.mergedSubValue}>
              {' '}
              ({new Date(grn.loanTakenAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})
            </span>
          )}
          {grn.loanStatus === 'CLEARED' && grn.loanClearedAt && (
            <span className={styles.mergedSubValue}>
              {' '}
              (Cleared: {new Date(grn.loanClearedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})
            </span>
          )}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Customer</span>
        <span className={styles.detailValue}>{grn.customerName}</span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Commodity</span>
        <span className={styles.detailValue}>{grn.commodityName}</span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Chamber</span>
        <span className={styles.detailValue}>
          <strong>{grn.chamber}</strong>
          {mergedChambers.length > 0 && (
            <span className={styles.mergedSubValue}> ({mergedChambers.join(', ')})</span>
          )}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Total Bags</span>
        <span className={styles.detailValue}>
          <strong>{grn.bags.toLocaleString('en-IN')} bags</strong>
          {bagsBreakdown && <span className={styles.mergedSubValue}> ({bagsBreakdown})</span>}
          {grn.netDeliveredBags != null && grn.netDeliveredBags > 0 ? (
            <>
              {' '}
              • {grn.netDeliveredBags.toLocaleString('en-IN')} Outward •{' '}
              {(grn.closingBags ?? (grn.bags - grn.netDeliveredBags)).toLocaleString('en-IN')} Bal
            </>
          ) : null}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Rent Structure</span>
        <span className={styles.detailValue}>
          {grn.rentType}
          {grn.rentType === 'Monthly' && grn.rentMonths ? ` (${grn.rentMonths} Months, info only)` : ''} —{' '}
          {grn.rentType === 'Monthly' && (grn.rentAmount == null || grn.rentAmount === 0)
            ? 'Dynamic (Cycle Billing)'
            : `₹${(grn.rentAmount ?? 0).toLocaleString('en-IN')}`}
        </span>
      </div>

      {(grn.smallBagPrice != null || grn.bigBagPrice != null || (grn.bagPrice != null && grn.bagPrice > 0)) && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Agreed Rates</span>
          <span className={styles.detailValue}>
            {grn.smallBagPrice != null || grn.bigBagPrice != null
              ? [
                  grn.smallBagPrice != null ? `Small: ₹${grn.smallBagPrice.toFixed(2)}` : null,
                  grn.bigBagPrice != null ? `Big: ₹${grn.bigBagPrice.toFixed(2)}` : null,
                ]
                  .filter(Boolean)
                  .join(' • ')
              : `₹${(grn.bagPrice ?? 0).toFixed(2)} / bag`}
          </span>
        </div>
      )}

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Gate Pass (GP) #</span>
        <span className={styles.detailValue}>{grn.gpNumber || 'None'}</span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Storage Mark</span>
        <span className={styles.detailValue}>
          <strong>{grn.grnNumber}</strong>
          {mergedStorageMarks.length > 0 && (
            <span className={styles.mergedSubValue}> ({mergedStorageMarks.join(', ')})</span>
          )}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Party Mark</span>
        <span className={styles.detailValue}>
          <strong>{grn.partyMark || 'None'}</strong>
          {mergedPartyMarks.length > 0 && (
            <span className={styles.mergedSubValue}> ({mergedPartyMarks.join(', ')})</span>
          )}
        </span>
      </div>

      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Vehicle No.</span>
        <span className={styles.detailValue}>{grn.vehicleNumber || 'None'}</span>
      </div>

      <div className={`${styles.detailItem} ${styles.span2}`}>
        <span className={styles.detailLabel}>Operator Remarks</span>
        <span className={styles.detailValue}>{cleanedRemarks || 'None'}</span>
      </div>
    </div>
  );
}
