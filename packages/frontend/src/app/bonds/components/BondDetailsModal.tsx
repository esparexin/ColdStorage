'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import styles from '../page.module.css';

interface BondDetailsModalProps {
  selectedGrn: Grn;
  loadingDetail: boolean;
  detailError: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export function BondDetailsModal({
  selectedGrn,
  loadingDetail,
  detailError,
  onClose,
  onRetry,
}: BondDetailsModalProps) {
  const loanStatusLabel = (() => {
    if (selectedGrn.loanStatus === 'TAKEN') return 'Loan Active (Hold)';
    if (selectedGrn.loanStatus === 'CLEARED') return 'Loan Cleared';
    if (selectedGrn.loanStatus === 'NOT_TAKEN') return 'Pledged (Loan Not Taken)';
    return '—';
  })();

  const loanBadgeVariant = selectedGrn.loanStatus === 'TAKEN'
    ? 'danger'
    : selectedGrn.loanStatus === 'CLEARED'
      ? 'success'
      : 'neutral';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={selectedGrn.bondNumber ? `Bond — ${selectedGrn.bondNumber}` : `Bond — ${selectedGrn.grnNumber}`}
      subtitle={`${selectedGrn.customerName} · ${selectedGrn.commodityName}`}
      size="md"
      footer={
        <Button variant="outline" onClick={onClose}>Close</Button>
      }
    >
      <div className={styles.modalBody}>
        {loadingDetail ? (
          <FeedbackStates.Loading label="Loading bond details..." />
        ) : detailError ? (
          <FeedbackStates.Error title="Error loading bond details" message={detailError} onRetry={onRetry} />
        ) : (
          <div className={styles.bondDetailView}>
            {/* Bond identity */}
            <div className={styles.bondSection}>
              <span className={styles.bondSectionLabel}>Bond / Lien Details</span>
              <dl className={styles.bondDl}>
                <dt>Customer</dt>
                <dd style={{ fontWeight: 'var(--font-semibold)' }}>{selectedGrn.customerName}</dd>

                <dt>GRN</dt>
                <dd>{selectedGrn.grnNumber}</dd>

                <dt>Commodity</dt>
                <dd>{selectedGrn.commodityName}</dd>

                <dt>Chamber</dt>
                <dd>{selectedGrn.chamber}</dd>

                <dt>Inward Date</dt>
                <dd>
                  {new Date(selectedGrn.date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </dd>
              </dl>
            </div>

            <div className={styles.bondSection}>
              <span className={styles.bondSectionLabel}>Bond Reference</span>
              <dl className={styles.bondDl}>
                <dt>Bond #</dt>
                <dd style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-primary-text)' }}>
                  {selectedGrn.bondNumber || '—'}
                </dd>

                <dt>Lien Holder</dt>
                <dd style={{ fontWeight: 'var(--font-medium)' }}>
                  {selectedGrn.loanBankName || '—'}
                </dd>

                <dt>Reference No.</dt>
                <dd>{selectedGrn.loanReferenceNumber || '—'}</dd>
              </dl>
            </div>

            <div className={styles.bondSection}>
              <span className={styles.bondSectionLabel}>Loan Status</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
                <Badge variant={loanBadgeVariant}>{loanStatusLabel}</Badge>
                {selectedGrn.loanTakenAt && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Loan taken:{' '}
                    {new Date(selectedGrn.loanTakenAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {selectedGrn.loanClearedAt && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Loan cleared:{' '}
                    {new Date(selectedGrn.loanClearedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {selectedGrn.loanRemarks && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {selectedGrn.loanRemarks}
                  </span>
                )}
              </div>
            </div>

            {/* Settlement summary if cleared */}
            {selectedGrn.loanStatus === 'CLEARED' && selectedGrn.loanSettlementAmount != null && (
              <div className={styles.bondSection}>
                <span className={styles.bondSectionLabel}>Settlement</span>
                <dl className={styles.bondDl}>
                  <dt>Amount</dt>
                  <dd style={{ fontWeight: 'var(--font-bold)' }}>
                    ₹{selectedGrn.loanSettlementAmount.toLocaleString('en-IN')}
                  </dd>
                  {selectedGrn.loanSettlementMode && (
                    <>
                      <dt>Mode</dt>
                      <dd>{selectedGrn.loanSettlementMode}</dd>
                    </>
                  )}
                  {selectedGrn.loanSettlementUtr && (
                    <>
                      <dt>UTR / Reference</dt>
                      <dd>{selectedGrn.loanSettlementUtr}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            {/* GRN Stock summary — referenced, not owned */}
            <div className={styles.bondSection}>
              <span className={styles.bondSectionLabel}>Related GRN Stock</span>
              <dl className={styles.bondDl}>
                <dt>Opening Stock</dt>
                <dd>{selectedGrn.bags.toLocaleString('en-IN')} Bags</dd>
                <dt>Current Balance</dt>
                <dd style={{ fontWeight: 'var(--font-semibold)' }}>
                  {(selectedGrn.closingBags ?? selectedGrn.bags).toLocaleString('en-IN')} Bags
                </dd>
                <dt>GRN Status</dt>
                <dd>
                  <Badge variant={selectedGrn.status === 'CLOSED' ? 'neutral' : 'warning'}>
                    {selectedGrn.status}
                  </Badge>
                </dd>
              </dl>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
