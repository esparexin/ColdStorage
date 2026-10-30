'use client';

import React from 'react';
import { DollarSign, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

export interface MergeStep3SettlementProps {
  totalSourcePendingRent: number;
  targetGrnNumber: string;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function MergeStep3Settlement({
  totalSourcePendingRent,
  targetGrnNumber,
  submitting,
  onBack,
  onNext,
}: MergeStep3SettlementProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={14} aria-hidden="true" />
            <span>Step 3: Rent Settlement</span>
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
            {totalSourcePendingRent > 0
              ? `Outstanding Balance: ₹${totalSourcePendingRent.toLocaleString('en-IN')}`
              : 'Fully Settled (₹0 due)'}
          </span>
        </div>

        {totalSourcePendingRent > 0 ? (
          <div className={`${styles.decisionCard} ${styles.decisionCardSelected}`}>
            <div className={styles.decisionHeader}>
              <span className={styles.decisionTitle}>
                <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
                <span>Pay Later · Separate Pending Bills</span>
              </span>
              <Badge variant="neutral">AGREED_PENDING</Badge>
            </div>
            <div className={styles.decisionDesc}>
              Total pending rent of ₹{totalSourcePendingRent.toLocaleString('en-IN')} across source GRNs will be carried forward under AGREED_PENDING terms as separate pending bills. Dues must be cleared prior to outward delivery of Destination GRN #{targetGrnNumber}.
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 'var(--space-1)' }}>
              Note: Consignment consolidation preserves each source GRN&apos;s historical obligation independently. Destination GRN #{targetGrnNumber} maintains its own active subscription without duplicate charges.
            </div>
          </div>
        ) : (
          <div className={styles.noticeBox} style={{ color: 'var(--color-success-text)', borderColor: 'var(--color-success)' }}>
            ✓ All source GRN obligations are fully settled. No pending balance carried forward.
          </div>
        )}
      </div>

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Bag Type"
        onNext={onNext}
        nextLabel="Next: Repacking & Final Preview"
        submitting={submitting}
      />
    </div>
  );
}
