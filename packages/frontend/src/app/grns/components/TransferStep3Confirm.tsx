'use client';

import React from 'react';
import { UserCheck } from 'lucide-react';
import type { Customer, Grn, OutwardBagCategory, TransferPaymentDecision } from '@cold-storage/contracts';
import { Badge, Input } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface TransferStep3ConfirmProps {
  currentGrn: Grn;
  selectedNewCustomer?: Customer;
  remainingBags: number;
  sourceBagCategory: OutwardBagCategory | '';
  effectiveDue: number;
  decision: TransferPaymentDecision;
  settleAmount: number;
  movementDate: string;
  reason: string;
  onReasonChange: (r: string) => void;
  remarks: string;
  onRemarksChange: (r: string) => void;
  submitting: boolean;
  onBack: () => void;
}

export function TransferStep3Confirm({
  currentGrn,
  selectedNewCustomer,
  remainingBags,
  sourceBagCategory,
  effectiveDue,
  decision,
  settleAmount,
  movementDate,
  reason,
  onReasonChange,
  remarks,
  onRemarksChange,
  submitting,
  onBack,
}: TransferStep3ConfirmProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserCheck size={14} aria-hidden="true" />
              <span>Transfer Overview</span>
            </span>
            <Badge variant="primary">Transfer</Badge>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>GRN Number:</span>
            <span className={styles.detailValue} style={{ fontWeight: 'var(--font-bold)' }}>{currentGrn.grnNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Current Owner:</span>
            <span className={styles.detailValue}>{currentGrn.customerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>New Transferee:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
              {selectedNewCustomer?.name}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Stock to Transfer:</span>
            <span className={styles.detailValue}>{remainingBags} Bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Confirmed Composition:</span>
            <span className={styles.detailValue}>
              <Badge variant="neutral">{sourceBagCategory || currentGrn.bagType}</Badge>
            </span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Rent Resolution:</span>
            <span className={styles.detailValue}>
              {effectiveDue > 0
                ? decision === 'SETTLE_NOW'
                  ? `Settled ₹${settleAmount} now (Receipt minted)`
                  : `Carried ₹${effectiveDue.toLocaleString('en-IN')} forward`
                : 'Fully Settled (₹0 due)'}
            </span>
          </div>

          <div style={{ marginTop: 'var(--space-1)' }}>
            <Input
              id="transfer-movement-date"
              label="Movement Date"
              type="date"
              value={movementDate}
              readOnly
              disabled={submitting}
              aria-label="Movement Date (read-only)"
              title="Authoritative operational date"
              required
            />
          </div>
        </div>

        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>Governance & Audit</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span>
          </div>

          <Input
            id="transfer-reason"
            label="Audit Reason (min 5 chars)"
            placeholder="e.g. Sale of lot / Farmer transfer"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={submitting}
            required
          />

          <div className={styles.formSection}>
            <label htmlFor="transfer-remarks" className={styles.inputLabel}>Additional Remarks (Optional)</label>
            <textarea
              id="transfer-remarks"
              aria-label="Additional Remarks"
              rows={2}
              className={styles.textarea}
              placeholder="Internal notes..."
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.noticeBox}>
            New owner must clear all outstanding GRN obligations prior to dispatch/delivery.
          </div>
        </div>
      </div>

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Dues & Settlement"
        isSubmitStep
        submitLabel="Transfer Ownership"
        submitting={submitting}
      />
    </div>
  );
}
