'use client';

import React from 'react';
import { DollarSign } from 'lucide-react';
import type { PaymentMode, TransferPaymentDecision } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface MovementSettlementProps {
  pendingAmount: number;
  decision: TransferPaymentDecision;
  onDecisionChange: (d: TransferPaymentDecision) => void;
  settleAmount: number;
  onSettleAmountChange: (amount: number) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  disabled?: boolean;
  transfereeOrTargetName?: string;
  isTransfer?: boolean;
  isMultiSource?: boolean;
}

export function MovementSettlementDecisionSection({
  pendingAmount,
  decision,
  onDecisionChange,
  settleAmount,
  onSettleAmountChange,
  paymentMode,
  onPaymentModeChange,
  disabled = false,
  transfereeOrTargetName,
  isTransfer = false,
  isMultiSource = false,
}: MovementSettlementProps) {
  const carryForwardTarget = transfereeOrTargetName ? `(${transfereeOrTargetName})` : '';
  const isSettleDisabled = disabled;

  return (
    <div className={styles.compactCard}>
      <div className={styles.cardHeader}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <DollarSign size={14} aria-hidden="true" />
          <span>Rent Settlement Decision</span>
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
          {pendingAmount > 0 ? `Outstanding Balance: ₹${pendingAmount.toLocaleString('en-IN')}` : 'Fully Settled (₹0 due)'}
        </span>
      </div>

      {pendingAmount > 0 ? (
        <>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            Choose how to resolve the unpaid liability of ₹{pendingAmount.toLocaleString('en-IN')}:
          </div>

          <div className={styles.decisionGrid}>
            <div
              className={`${styles.decisionCard} ${decision === 'AGREED_PENDING' ? styles.decisionCardSelected : ''}`}
              onClick={() => { if (!disabled) onDecisionChange('AGREED_PENDING'); }}
              role="radio"
              aria-checked={decision === 'AGREED_PENDING'}
              tabIndex={0}
            >
              <div className={styles.decisionHeader}>
                <span className={styles.decisionTitle}>
                  <input
                    type="radio"
                    name="settlement-decision"
                    aria-label={isTransfer ? 'Pay Later' : 'Separate Pending Bills'}
                    checked={decision === 'AGREED_PENDING'}
                    onChange={() => onDecisionChange('AGREED_PENDING')}
                    disabled={disabled}
                  />
                  {isTransfer ? 'Pay Later' : 'Separate Pending Bills'}
                </span>
                <Badge variant="neutral">{isTransfer ? 'Carry Forward' : 'Separate Bills'}</Badge>
              </div>
              <div className={styles.decisionDesc}>
                {isTransfer
                  ? `Transferee ${carryForwardTarget} assumes the unpaid balance. Dues carry forward and must be cleared prior to delivery.`
                  : `Source GRN unpaid balance remains as a separate pending bill under Pending Dues. It will not reflect on target GRN ${carryForwardTarget}.`}
              </div>
            </div>

            <div
              className={`${styles.decisionCard} ${decision === 'SETTLE_NOW' ? styles.decisionCardSelected : ''} ${isSettleDisabled ? styles.decisionCardDisabled : ''}`}
              onClick={() => { if (!isSettleDisabled) onDecisionChange('SETTLE_NOW'); }}
              role="radio"
              aria-checked={decision === 'SETTLE_NOW'}
              aria-disabled={isSettleDisabled}
              tabIndex={isSettleDisabled ? -1 : 0}
            >
              <div className={styles.decisionHeader}>
                <span className={styles.decisionTitle}>
                  <input
                    type="radio"
                    name="settlement-decision"
                    aria-label="Pay Now"
                    checked={decision === 'SETTLE_NOW'}
                    onChange={() => onDecisionChange('SETTLE_NOW')}
                    disabled={isSettleDisabled}
                  />
                  Pay Now
                </span>
                <Badge variant="primary">Settle Now</Badge>
              </div>
              <div className={styles.decisionDesc}>
                Clear the outstanding rent balance now. Official payment receipt(s) will be generated immediately.
              </div>
            </div>
          </div>

          {decision === 'SETTLE_NOW' && (
            <div className={styles.paymentBox}>
              <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                Inline Rent Collection Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div>
                  <label htmlFor="settle-amount-input" className={styles.inputLabel}>Amount to Settle (₹) *</label>
                  <Input
                    id="settle-amount-input"
                    type="number"
                    min={1}
                    max={pendingAmount}
                    value={settleAmount}
                    onChange={(e) => onSettleAmountChange(e.target.value !== '' ? parseFloat(e.target.value) : 0)}
                    disabled={disabled}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="settle-payment-mode" className={styles.inputLabel}>Payment Mode *</label>
                  <Select
                    id="settle-payment-mode"
                    value={paymentMode}
                    onChange={(e) => onPaymentModeChange(e.target.value as PaymentMode)}
                    disabled={disabled}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </Select>
                </div>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)' }}>
                ✓ Official rent payment receipt will be generated for ₹{settleAmount} via {paymentMode}.
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.noticeBox} style={{ color: 'var(--color-success-text)', borderColor: 'var(--color-success)' }}>
          ✓ Stored rent is fully cleared. No payment settlement required.
        </div>
      )}
    </div>
  );
}
