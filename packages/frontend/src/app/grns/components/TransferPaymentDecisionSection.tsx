'use client';

import React from 'react';
import { Badge, Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface TransferPaymentDecisionSectionProps {
  pendingAmount: number;
  decision: 'AGREED_PENDING' | 'SETTLE_NOW';
  onDecisionChange: (d: 'AGREED_PENDING' | 'SETTLE_NOW') => void;
  settleAmount: number;
  onSettleAmountChange: (amount: number) => void;
  paymentMode: 'Cash' | 'UPI';
  onPaymentModeChange: (mode: 'Cash' | 'UPI') => void;
  disabled?: boolean;
}

export function TransferPaymentDecisionSection({
  pendingAmount,
  decision,
  onDecisionChange,
  settleAmount,
  onSettleAmountChange,
  paymentMode,
  onPaymentModeChange,
  disabled = false,
}: TransferPaymentDecisionSectionProps) {
  if (pendingAmount <= 0) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-2)',
        background: 'var(--color-surface-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          className={styles.inputLabel}
          style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}
        >
          Rent Settlement Decision
        </span>
        <Badge variant={decision === 'SETTLE_NOW' ? 'success' : 'warning'}>
          {decision === 'SETTLE_NOW' ? 'Settle Now' : 'Carry Forward'}
        </Badge>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <label
          htmlFor="decision-agreed-pending"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          <input
            id="decision-agreed-pending"
            type="radio"
            name="transfer-payment-decision"
            value="AGREED_PENDING"
            checked={decision === 'AGREED_PENDING'}
            onChange={() => onDecisionChange('AGREED_PENDING')}
            disabled={disabled}
          />
          <span>Carry Forward to Transferee (₹{pendingAmount.toLocaleString('en-IN')})</span>
        </label>

        <label
          htmlFor="decision-settle-now"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          <input
            id="decision-settle-now"
            type="radio"
            name="transfer-payment-decision"
            value="SETTLE_NOW"
            checked={decision === 'SETTLE_NOW'}
            onChange={() => onDecisionChange('SETTLE_NOW')}
            disabled={disabled}
          />
          <span>Settle Outstanding Dues Now</span>
        </label>
      </div>

      {decision === 'SETTLE_NOW' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-2)',
            paddingTop: 'var(--space-1)',
          }}
        >
          <div>
            <label htmlFor="settle-amount-input" className={styles.inputLabel}>
              Payment Amount (₹) *
            </label>
            <Input
              id="settle-amount-input"
              type="number"
              min={1}
              max={pendingAmount}
              value={settleAmount}
              onChange={(e) => onSettleAmountChange(Math.max(0, Number(e.target.value)))}
              disabled={disabled}
              required
            />
          </div>
          <div>
            <label htmlFor="settle-payment-mode" className={styles.inputLabel}>
              Payment Mode *
            </label>
            <Select
              id="settle-payment-mode"
              value={paymentMode}
              onChange={(e) => onPaymentModeChange(e.target.value as 'Cash' | 'UPI')}
              disabled={disabled}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

export function validateTransferPayment(
  decision: string,
  amount: number,
  pending: number,
): string | null {
  if (decision === 'SETTLE_NOW') {
    if (amount <= 0) return 'Payment amount must be greater than zero.';
    if (amount > pending) return `Payment cannot exceed pending balance of ₹${pending.toLocaleString('en-IN')}.`;
  }
  return null;
}
