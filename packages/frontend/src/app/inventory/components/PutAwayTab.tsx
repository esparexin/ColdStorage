'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { usePutAway } from '../hooks/usePutAway';
import { GrnAllocationStatusCard } from './GrnAllocationStatusCard';
import styles from '../page.module.css';

interface PutAwayTabProps {
  openGrns: Grn[];
  putAway: ReturnType<typeof usePutAway>;
  canAllocate: boolean;
  canPayRent: boolean;
  payLoading: boolean;
  onPayRent: () => void;
}

export function PutAwayTab({ openGrns, putAway, canAllocate, canPayRent, payLoading, onPayRent }: PutAwayTabProps) {
  return (
    <div className={styles.putAwayLayout}>
      {/* Left Sidebar */}
      <div className={styles.grnSidebar}>
        <div className={styles.sidebarHeader}>
          <span>Pending Inward GRNs ({openGrns.length})</span>
        </div>

        {openGrns.length === 0 ? (
          <FeedbackStates.Empty message="No OPEN Goods Receipt Notes requiring allocation." />
        ) : (
          <div className={styles.grnList}>
            {openGrns.map((g) => {
              const isActive = g.id === putAway.selectedGrnId;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`${styles.grnCard} ${isActive ? styles.grnCardActive : ''}`}
                  onClick={() => putAway.setSelectedGrnId(g.id)}
                >
                  <div className={styles.grnCardTop}>
                    <span className={styles.grnCardNum}>{g.grnNumber}</span>
                    <span className={styles.unallocatedPill}>Chamber {g.chamber}</span>
                  </div>
                  <span className={styles.grnCardCust}>{g.customerName}</span>
                  <div className={styles.grnCardMeta}>
                    <span>{g.commodityName}</span>
                    <span style={{ fontWeight: 600 }}>{g.bags} bags</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Work Area */}
      <div className={styles.putAwayWorkArea}>
        {!putAway.selectedGrnId || !putAway.grnSummary ? (
          <FeedbackStates.Empty message="Select an inward GRN from the left list to allocate bags." />
        ) : putAway.loadingGrnDetails ? (
          <FeedbackStates.Loading label="Loading GRN allocation summary..." />
        ) : (
          <>
            <GrnAllocationStatusCard
              grnSummary={putAway.grnSummary}
              pastAllocations={putAway.pastAllocations}
            />

            {putAway.grnSummary.unallocatedBags > 0 && canAllocate && (
              <div className={styles.allocationFormCard}>
                <div className={styles.formHeader}>
                  <h3 className={styles.formSectionTitle}>Confirm Stock in Chamber</h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Chamber {putAway.grnSummary.chamber}
                  </span>
                </div>

                {putAway.rentBlocked ? (
                  <div className={styles.modalError} role="alert">
                    Rent ₹{putAway.rentBlocked.remainingBalance.toLocaleString('en-IN')} pending for{' '}
                    {putAway.rentBlocked.grnNumber}. Complete payment to allocate — you will return here.
                    {canPayRent && (
                      <div style={{ marginTop: 8 }}>
                        <Button variant="primary" onClick={onPayRent} disabled={payLoading} isLoading={payLoading}>
                          {payLoading ? 'Loading rent account...' : 'Pay rent now'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  putAway.allocError && <div className={styles.modalError}>{putAway.allocError}</div>
                )}

                <form
                  onSubmit={putAway.handlePutAwaySubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
                >
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    Confirming records all {putAway.grnSummary.unallocatedBags} outstanding bags of{' '}
                    {putAway.grnSummary.totalBags} received as on hand in chamber{' '}
                    {putAway.grnSummary.chamber}.
                  </p>

                  <input aria-label="Optional put-away notes or lot observations"
                    type="text"
                    placeholder="Optional put-away notes or lot observations"
                    className={styles.fieldInput}
                    value={putAway.allocNotes}
                    onChange={(e) => putAway.setAllocNotes(e.target.value)}
                    maxLength={500}
                  />

                  <input aria-label="Optional put-away notes or lot observations"
                    type="text"
                    placeholder="Optional put-away notes or lot observations"
                    className={styles.fieldInput}
                    value={putAway.allocNotes}
                    onChange={(e) => putAway.setAllocNotes(e.target.value)}
                    maxLength={500}
                  />

                  <div className={styles.formFooter}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      Allocating{' '}
                      <span style={{ color: 'var(--color-primary)' }}>
                        {putAway.grnSummary.unallocatedBags}
                      </span>{' '}
                      bags
                    </span>

                    <Button
                      id="submit-allocation-btn"
                      type="submit"
                      variant="primary"
                      disabled={putAway.allocSubmitting || !!putAway.rentBlocked}
                      isLoading={putAway.allocSubmitting}
                    >
                      {putAway.rentBlocked
                        ? 'Rent payment required'
                        : putAway.allocSubmitting
                          ? 'Recording...'
                          : 'Confirm Put-Away'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
