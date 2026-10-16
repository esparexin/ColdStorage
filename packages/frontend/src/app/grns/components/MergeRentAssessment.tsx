'use client';

import React, { useEffect, useState } from 'react';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import type { BagConfirmationValue } from './MergeBagCategoryFields';
import { deriveMergeRentAssessment } from './mergeRentAssessment.helper';
import styles from './InternalMovementModal.module.css';

export interface MergeRentAssessmentProps {
  facilityId?: string;
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
  facilityId,
  selectedSources,
  totalSourceBags,
  movementDate,
  repackMode,
  commodityHamaliRate = 0,
}: MergeRentAssessmentProps) {
  const [summaries, setSummaries] = useState<Record<string, RentSummaryDto>>({});

  useEffect(() => {
    if (!facilityId || selectedSources.length === 0) return;
    let isMounted = true;
    const missingSources = selectedSources.filter((s) => !summaries[s.id]);
    if (missingSources.length === 0) return;

    for (const source of missingSources) {
      requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(source.id)}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((dto: RentSummaryDto | null) => {
          if (isMounted && dto) {
            setSummaries((prev) => (prev[source.id] ? prev : { ...prev, [source.id]: dto }));
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [facilityId, selectedSources, summaries]);

  if (selectedSources.length === 0 || totalSourceBags <= 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      {selectedSources.map((source) => {
        const summary = summaries[source.id];
        const sourceBags = source.closingBags ?? source.bags;
        const {
          historicalObligation, amountPaid, outstandingBalance,
          isSettled, carriedRent, repackHamali, totalCarried, inwardDateStr,
        } = deriveMergeRentAssessment({
          source, summary, repackMode, commodityHamaliRate,
        });

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
                <span className={styles.detailLabel}>Historical Rent Obligation:</span>
                <span className={styles.detailValue}>₹{historicalObligation.toLocaleString('en-IN')}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Amount Already Paid:</span>
                <span className={styles.detailValue}>₹{amountPaid.toLocaleString('en-IN')}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Outstanding Balance:</span>
                <span className={styles.detailValue} style={{ color: isSettled ? 'var(--color-success-text)' : 'var(--color-warning-text)', fontWeight: 'var(--font-bold)' }}>
                  ₹{outstandingBalance.toLocaleString('en-IN')}
                </span>
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
                <span className={styles.detailLabel}>New Repacking Hamali:</span>
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
              {isSettled ? (
                summary?.payments && summary.payments.length > 0 ? (
                  <>
                    Source GRN rent is fully settled. Historical payment receipts verified:{' '}
                    {summary.payments.map((p) => `#${p.receiptNumber} (₹${p.amountPaid.toLocaleString('en-IN')})`).join(', ')}.
                    Historical seasons are preserved without recalculation or duplicate billing. Surviving GRN continues its existing lifecycle.
                  </>
                ) : (
                  'Source GRN rent is fully settled. Historical seasons are preserved without recalculation or duplicate billing. Surviving GRN continues its existing lifecycle.'
                )
              ) : (
                `Historical rent obligation: ₹${historicalObligation.toLocaleString('en-IN')}, Paid: ₹${amountPaid.toLocaleString('en-IN')}. Only verified outstanding dues of ₹${carriedRent.toLocaleString('en-IN')} are carried forward to the target GRN. Historical seasons are not recalculated as an outward delivery.`
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
