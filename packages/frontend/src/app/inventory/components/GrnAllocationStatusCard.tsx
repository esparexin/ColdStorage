'use client';

import React from 'react';
import type { GrnInventorySummary, PutAwayAllocation } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface GrnAllocationStatusCardProps {
  grnSummary: GrnInventorySummary;
  pastAllocations: PutAwayAllocation[];
}

export function GrnAllocationStatusCard({
  grnSummary,
  pastAllocations,
}: GrnAllocationStatusCardProps) {
  const pct = Math.min(
    100,
    Math.round((grnSummary.allocatedBags / grnSummary.totalBags) * 100),
  );

  return (
    <>
      <div className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
              {grnSummary.grnNumber}
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Assigned Chamber: Chamber {grnSummary.chamber}
            </span>
          </div>
          <span
            className={
              grnSummary.putAwayStatus === 'ALLOCATED'
                ? styles.fullyAllocatedPill
                : styles.unallocatedPill
            }
          >
            {grnSummary.putAwayStatus}
          </span>
        </div>

        <div className={styles.progressBarContainer}>
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressBarText}>
            <span>
              Allocated: <strong>{grnSummary.allocatedBags}</strong> / {grnSummary.totalBags} bags
            </span>
            <span>
              Unallocated Remaining:{' '}
              <strong style={{ color: 'var(--color-warning)' }}>
                {grnSummary.unallocatedBags}
              </strong>{' '}
              bags
            </span>
          </div>
        </div>
      </div>

      <div className={styles.summaryCard}>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          Allocation History ({pastAllocations.length} batches)
        </h3>

        {pastAllocations.length === 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            No allocations recorded yet for this GRN.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {pastAllocations.map((batch) => (
              <div
                key={batch.id}
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--color-surface-2)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{batch.bags} Bags Allocated</span>
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                    by {batch.allocatedBy} on {new Date(batch.allocatedAt).toLocaleDateString('en-IN')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      background: 'var(--color-surface-3)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {batch.chamber}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
