'use client';

import React from 'react';
import { UserCheck } from 'lucide-react';
import type { Customer, Grn, OutwardBagCategory, TransferPaymentDecision } from '@cold-storage/contracts';
import { Badge, Input } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import {
  formatTransferComposition,
  formatTransferHamali,
  formatTransferSettlement,
} from './transferStep3Summary.helper';
import styles from './InternalMovementModal.module.css';

interface TransferStep3ConfirmProps {
  currentGrn: Grn;
  selectedNewCustomer?: Customer;
  remainingBags: number;
  confirmedSmallBags?: number | '';
  confirmedBigBags?: number | '';
  sourceBagCategory: OutwardBagCategory | '';
  hamaliRate?: number | null;
  hamaliAmount?: number;
  assessedRent: number;
  totalPaid: number;
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
  confirmedSmallBags,
  confirmedBigBags,
  sourceBagCategory,
  hamaliRate,
  hamaliAmount,
  assessedRent,
  totalPaid,
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
  const isHybrid = sourceBagCategory === 'Hybrid' || currentGrn.bagType === 'Hybrid';
  const totalLabor = hamaliAmount ?? 0;
  const totalApplicableRent = assessedRent + totalLabor;

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
            <span className={styles.detailLabel}>Previous Owner:</span>
            <span className={styles.detailValue}>{currentGrn.customerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>New Owner:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
              {selectedNewCustomer?.name}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Transfer Date:</span>
            <span className={styles.detailValue}>{movementDate}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Updated Total Bags:</span>
            <span className={styles.detailValue}>{remainingBags} Bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Confirmed Bag Type:</span>
            <span className={styles.detailValue}>
              <Badge variant="neutral">{isHybrid ? 'Hybrid' : 'S/B'}</Badge>
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Bag Composition:</span>
            <span className={styles.detailValue}>
              {formatTransferComposition({ isHybrid, remainingBags, confirmedSmallBags, confirmedBigBags })}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Applicable Hamali:</span>
            <span className={styles.detailValue}>
              {formatTransferHamali({ hamaliRate, hamaliAmount: totalLabor })}
            </span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Total Rent Assessed:</span>
            <span className={styles.detailValue}>₹{totalApplicableRent.toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Already Paid:</span>
            <span className={styles.detailValue}>₹{totalPaid.toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Outstanding Balance:</span>
            <span className={styles.detailValue} style={{ fontWeight: 'var(--font-bold)' }}>
              ₹{effectiveDue.toLocaleString('en-IN')}
            </span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Settlement Decision:</span>
            <span className={styles.detailValue}>
              {formatTransferSettlement({ effectiveDue, decision, settleAmount, newCustomerName: selectedNewCustomer?.name })}
            </span>
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
