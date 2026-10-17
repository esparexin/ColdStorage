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
          {decision === 'SETTLE_NOW' ? 'Settlement Required' : 'Carry Forward'}
        </Badge>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        <label
          htmlFor="decision-settle-now"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: decision === 'SETTLE_NOW' ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: decision === 'SETTLE_NOW' ? 'var(--color-primary-subtle)' : 'var(--color-surface-2)',
            boxShadow: decision === 'SETTLE_NOW' ? '0 0 0 1px var(--color-primary)' : 'none',
            fontSize: 'var(--text-xs)',
            fontWeight: decision === 'SETTLE_NOW' ? 'var(--font-semibold)' : 'var(--font-medium)',
            color: decision === 'SETTLE_NOW' ? 'var(--color-primary-text)' : 'var(--color-text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast, 0.15s ease)',
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
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Settle Outstanding Dues Now</span>
            <span style={{ fontSize: 'var(--text-xs)', color: decision === 'SETTLE_NOW' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
              ₹{pendingAmount.toLocaleString('en-IN')} due
            </span>
          </div>
        </label>

        <label
          htmlFor="decision-agreed-pending"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: decision === 'AGREED_PENDING' ? '1.5px solid var(--color-warning)' : '1px solid var(--color-border)',
            background: decision === 'AGREED_PENDING' ? 'var(--color-warning-subtle)' : 'var(--color-surface-2)',
            boxShadow: decision === 'AGREED_PENDING' ? '0 0 0 1px var(--color-warning)' : 'none',
            fontSize: 'var(--text-xs)',
            fontWeight: decision === 'AGREED_PENDING' ? 'var(--font-semibold)' : 'var(--font-medium)',
            color: decision === 'AGREED_PENDING' ? 'var(--color-warning-text)' : 'var(--color-text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast, 0.15s ease)',
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
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span>Carry Forward to Transferee</span>
            <span style={{ fontSize: 'var(--text-xs)', color: decision === 'AGREED_PENDING' ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
              Agreed Pending
            </span>
          </div>
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
              min={pendingAmount}
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

export { validateTransferPayment } from './internalMovementPayload.helper';
