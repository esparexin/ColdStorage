'use client';

import React from 'react';
import type { FacilityInventorySummary } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import styles from '../page.module.css';

interface ChamberStockTabProps {
  stockSummary: FacilityInventorySummary | null;
  loadingSummary: boolean;
  currentFacilityName: string;
}

export function ChamberStockTab({
  stockSummary,
  loadingSummary,
  currentFacilityName,
}: ChamberStockTabProps) {
  if (loadingSummary) {
    return <FeedbackStates.Loading label="Loading chamber stock distribution..." />;
  }

  const totalBags = stockSummary?.totalStockBags ?? 0;
  const byChamber = stockSummary?.byChamber ?? [];
  const byCommodity = stockSummary?.byCommodity ?? [];

  if (totalBags === 0 || (byChamber.length === 0 && byCommodity.length === 0)) {
    return (
      <FeedbackStates.Empty
        message={`No physical stock currently stored in ${currentFacilityName}. Stock is recorded automatically upon Inward GRN receipt.`}
      />
    );
  }

  return (
    <div className={styles.tabContent}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Chamber Distribution Card */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Stock by Chamber</h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {byChamber.length} {byChamber.length === 1 ? 'Chamber' : 'Chambers'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {byChamber.map((item) => {
              const pct = totalBags > 0 ? Math.round((item.totalBags / totalBags) * 100) : 0;
              return (
                <div
                  key={item.chamber}
                  style={{
                    padding: 'var(--space-2)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1-5)' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      Chamber {item.chamber}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {item.totalBags.toLocaleString('en-IN')} bags{' '}
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Commodity Distribution Card */}
        <div className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Stock by Commodity</h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {byCommodity.length} {byCommodity.length === 1 ? 'Commodity' : 'Commodities'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {byCommodity.map((item) => {
              const pct = totalBags > 0 ? Math.round((item.totalBags / totalBags) * 100) : 0;
              return (
                <div
                  key={item.commodityId}
                  style={{
                    padding: 'var(--space-3)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1-5)' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {item.commodityName}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {item.totalBags.toLocaleString('en-IN')} bags{' '}
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
