'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import type { BagConfirmationValue } from './MergeBagCategoryFields';
import styles from './InternalMovementModal.module.css';

export interface MergeRentAssessmentProps {
  selectedSources: Grn[];
  confirmation: BagConfirmationValue;
  totalSourceBags: number;
  movedSmall: number;
  movedBig?: number;
  movementDate: string;
  repackMode: boolean;
  commodityHamaliRate?: number;
}

export function MergeRentAssessment({
  selectedSources,
  totalSourceBags,
  movementDate,
  repackMode,
  commodityHamaliRate = 0,
}: MergeRentAssessmentProps) {
  if (selectedSources.length === 0 || totalSourceBags <= 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      {selectedSources.map((source) => {
        const sourceBags = source.closingBags ?? source.bags;
        const isSettled = source.rentPaymentStatus === 'Settled' || source.rentRemainingBalance === 0;
        const carriedRent = source.rentRemainingBalance !== undefined
          ? source.rentRemainingBalance
          : isSettled
            ? 0
            : (source.rentAmount ?? 0);

        const repackHamali = repackMode && commodityHamaliRate > 0
          ? sourceBags * commodityHamaliRate
          : 0;
        const totalCarried = carriedRent + repackHamali;
        const inwardDateStr = source.date ? new Date(source.date).toLocaleDateString('en-IN') : '—';

        return (
          <div key={source.id} className={styles.compactCard}>
            <div className={styles.cardHeader}>
              <span>Source GRN {source.grnNumber} — Financial Settlement & Carry-Forward</span>
              <Badge variant={isSettled ? 'success' : 'warning'}>
                {isSettled ? 'Fully Settled (₹0 Due)' : `Pending Due: ₹${carriedRent.toLocaleString('en-IN')}`}
              </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-1) var(--space-3)' }}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Inward Date:</span>
                <span className={styles.detailValue}>{inwardDateStr}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Bags Merged:</span>
                <span className={styles.detailValue}>{sourceBags} bags</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Stored Rent Obligation:</span>
                <span className={styles.detailValue}>₹{(source.rentAmount ?? 0).toLocaleString('en-IN')}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Historical Rent Status:</span>
                <span className={styles.detailValue} style={{ color: isSettled ? 'var(--color-success-text)' : 'var(--color-warning-text)' }}>
                  {isSettled ? 'Already Paid in Full' : 'Unpaid Dues'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Carried Rent Obligation:</span>
                <span className={styles.detailValue} style={{ fontWeight: 'var(--font-bold)' }}>
                  ₹{carriedRent.toLocaleString('en-IN')}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Repacking Hamali Labor:</span>
                <span className={styles.detailValue}>
                  {repackMode
                    ? `₹${repackHamali.toLocaleString('en-IN')} (${sourceBags} bags @ ₹${commodityHamaliRate}/bag)`
                    : '₹0 (Physical repacking not selected)'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Total Carried to Target:</span>
                <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
                  ₹{totalCarried.toLocaleString('en-IN')}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Effective Movement Date:</span>
                <span className={styles.detailValue}>{movementDate}</span>
              </div>
            </div>

            <div className={styles.noticeBox} style={{ fontSize: 'var(--text-xs)' }}>
              {isSettled
                ? 'Source GRN rent is fully settled. Historical seasons are preserved without recalculation or duplicate billing. Surviving GRN continues its existing lifecycle.'
                : `Only actual outstanding dues of ₹${carriedRent.toLocaleString('en-IN')} are carried forward to the target GRN. Historical seasons are not recalculated as an outward delivery.`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
