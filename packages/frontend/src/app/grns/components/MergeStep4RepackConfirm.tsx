'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { isHybridBagCategory, type Grn, type OutwardBagCategory, type TransferPaymentDecision } from '@cold-storage/contracts';
import { Badge, Input } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface MergeStep4RepackConfirmProps {
  repackMode: boolean;
  onRepackModeChange: (active: boolean) => void;
  repackSmall: number | '';
  onRepackSmallChange: (val: number | '') => void;
  repackBig: number | '';
  onRepackBigChange: (val: number | '') => void;
  referenceWeight: number | '';
  onReferenceWeightChange: (val: number | '') => void;
  repackHamaliCharge: number;
  actualRepackedBags: number;
  commodityHamaliRate: number;
  movementDate: string;
  targetGrn: Grn;
  targetCurrentRemaining: number;
  addedBagsToTarget: number;
  isRepackFilled: boolean;
  targetNewRemaining: number;
  confirmationCategory: OutwardBagCategory;
  resultingBagType: string;
  settlementDecision: TransferPaymentDecision;
  settleAmount: number;
  totalSourcePendingRent: number;
  reason: string;
  onReasonChange: (r: string) => void;
  remarks: string;
  onRemarksChange: (r: string) => void;
  selectedSourcesCount: number;
  movedSmall: number;
  movedBig: number;
  submitting: boolean;
  onBack: () => void;
}

export function MergeStep4RepackConfirm(props: MergeStep4RepackConfirmProps) {
  const {
    repackMode, onRepackModeChange, repackSmall, onRepackSmallChange,
    repackBig, onRepackBigChange, referenceWeight, onReferenceWeightChange,
    repackHamaliCharge, actualRepackedBags, commodityHamaliRate, movementDate,
    targetGrn, targetCurrentRemaining, addedBagsToTarget, isRepackFilled,
    targetNewRemaining, confirmationCategory, resultingBagType, settlementDecision,
    settleAmount, totalSourcePendingRent, reason, onReasonChange, remarks,
    onRemarksChange, selectedSourcesCount, movedSmall, movedBig, submitting, onBack,
  } = props;
  const isHybrid = isHybridBagCategory(confirmationCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} aria-hidden="true" />
              <span>Physical Repacking (No Old Count Constraints)</span>
            </span>
            <Badge variant={repackMode ? 'primary' : 'neutral'}>{repackMode ? 'Repacking Active' : 'Direct Merge'}</Badge>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '4px 0' }}>
            <input type="checkbox" id="repack-mode-step4" checked={repackMode} onChange={(e) => onRepackModeChange(e.target.checked)} disabled={submitting} />
            <span style={{ fontWeight: 'var(--font-semibold)' }}>Physically Repack / Re-bag Stock (Enter actual resulting counts)</span>
          </label>

          {repackMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', marginTop: '4px' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Enter physical bag counts resulting from re-bagging. <em>No validation against previous bag counts</em>: old source batches are permanently closed.
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="repack-small-step4" className={styles.inputLabel}>Repacked Small Bags *</label>
                  <Input id="repack-small-step4" type="number" min={0} placeholder="Small Bags" value={repackSmall} onChange={(e) => onRepackSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="repack-big-step4" className={styles.inputLabel}>Repacked Big Bags *</label>
                  <Input id="repack-big-step4" type="number" min={0} placeholder="Big Bags" value={repackBig} onChange={(e) => onRepackBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} required />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
                <span>Physical Repacked Total:</span>
                <strong style={{ color: 'var(--color-primary-text)' }}>{typeof repackSmall === 'number' && typeof repackBig === 'number' ? repackSmall + repackBig : 0} Bags</strong>
              </div>

              {repackHamaliCharge > 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
                  Repacking Hamali Labor: <strong>₹{repackHamaliCharge}</strong> ({actualRepackedBags} bags @ ₹{commodityHamaliRate}/bag)
                </div>
              )}

              <div>
                <label htmlFor="merge-ref-weight" className={styles.inputLabel}>Reference Weight (kg) — Optional</label>
                <Input id="merge-ref-weight" type="number" min={0} placeholder="e.g. 2500" value={referenceWeight} onChange={(e) => onReferenceWeightChange(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
              </div>
            </div>
          )}

          <div className={styles.formSection} style={{ marginTop: 'var(--space-1)' }}>
            <label htmlFor="merge-date" className={styles.inputLabel}>Movement Date *</label>
            <Input id="merge-date" type="date" value={movementDate} readOnly disabled={submitting} aria-label="Movement Date (read-only)" title="Authoritative operational date" required />
          </div>
        </div>

        {/* Destination Preview & Audit */}
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>Destination GRN Preview & Audit</span>
            <Badge variant="primary">Audit-Safe</Badge>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Target GRN:</span>
            <span className={styles.detailValue}>{targetGrn.grnNumber} ({targetGrn.customerName})</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Initial Target Stock:</span>
            <span className={styles.detailValue}>{targetCurrentRemaining} bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>+ Added from Merge:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
              +{addedBagsToTarget} bags {repackMode && isRepackFilled ? `(${repackSmall}S · ${repackBig}B)` : `(${movedSmall}S · ${movedBig}B)`}
            </span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Combined Target Stock:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{targetNewRemaining} Bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Resulting Bag Type:</span>
            <span className={styles.detailValue}><Badge variant="primary">{isHybrid ? 'Hybrid' : resultingBagType}</Badge></span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Rent Settlement:</span>
            <span className={styles.detailValue}>{settlementDecision === 'SETTLE_NOW' ? `Settled ₹${settleAmount} now` : `Carried ₹${totalSourcePendingRent} forward`}</span>
          </div>

          <div className={styles.formSection} style={{ marginTop: 'var(--space-1)' }}>
            <label htmlFor="merge-reason" className={styles.inputLabel}>Audit Reason (min 5 chars) *</label>
            <Input id="merge-reason" placeholder="e.g. Stock consolidation / Re-bagging lot" value={reason} onChange={(e) => onReasonChange(e.target.value)} disabled={submitting} required />
          </div>

          <div className={styles.formSection}>
            <label htmlFor="merge-remarks" className={styles.inputLabel}>Additional Remarks (Optional)</label>
            <textarea id="merge-remarks" aria-label="Additional Remarks" rows={2} className={styles.textarea} placeholder="Notes or remarks..." value={remarks} onChange={(e) => onRemarksChange(e.target.value)} disabled={submitting} />
          </div>

          <div className={styles.noticeBox}>
            All {selectedSourcesCount} source GRN{selectedSourcesCount > 1 ? 's' : ''} will be permanently closed. Stock and obligations will reside on surviving GRN {targetGrn.grnNumber}.
          </div>
        </div>
      </div>

      <WizardStepActions onBack={onBack} backLabel="Back to Settlement" isSubmitStep submitLabel="Execute Merge & Repack" submitting={submitting} />
    </div>
  );
}
