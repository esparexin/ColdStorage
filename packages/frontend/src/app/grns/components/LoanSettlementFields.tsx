'use client';

import { Button } from '@/components/ui';
import styles from './LoanSettlementFields.module.css';

import type { LoanSettlementState } from '../hooks/loanSettlement.helper';

interface LoanSettlementFieldsProps {
  value: LoanSettlementState;
  onChange: (updates: Partial<LoanSettlementState>) => void;
  lenderBankName?: string | null;
  loanReferenceNumber?: string | null;
}

export function LoanSettlementFields({
  value,
  onChange,
  lenderBankName,
  loanReferenceNumber,
}: LoanSettlementFieldsProps) {
  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <span>Loan Clearance &amp; Settlement Payment Details</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>SSOT RECORD</span>
      </div>

      <div className={styles.clearNotice}>
        ✓ Confirming Loan Cleared records settlement payment details and unblocks Outward Delivery.
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Payment Mode *</span>
        <div className={styles.modeSelector}>
          {(['Cash', 'UPI', 'Bank Transfer'] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              id={`select-mode-${mode.toLowerCase().replace(/\s+/g, '-')}`}
              variant={value.paymentMode === mode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => onChange({ paymentMode: mode })}
            >
              {mode}
            </Button>
          ))}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="settlement-amount" className={styles.fieldLabel}>Amount Paid (₹) *</label>
          <input
            id="settlement-amount"
            type="number"
            min="1"
            step="any"
            className={styles.fieldInput}
            placeholder="e.g. 50000"
            value={value.amountPaid}
            onChange={(e) => onChange({ amountPaid: e.target.value })}
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="settlement-date" className={styles.fieldLabel}>Payment Date *</label>
          <input
            id="settlement-date"
            type="date"
            className={styles.fieldInput}
            value={value.paymentDate}
            onChange={(e) => onChange({ paymentDate: e.target.value })}
            required
          />
        </div>
      </div>

      {value.paymentMode === 'UPI' && (
        <div className={styles.grid2}>
          <div className={styles.fieldGroup}>
            <label htmlFor="settlement-utr" className={styles.fieldLabel}>UPI UTR / Reference # *</label>
            <input
              id="settlement-utr"
              type="text"
              maxLength={50}
              className={styles.fieldInput}
              placeholder="e.g. 331284918239"
              value={value.utrNumber}
              onChange={(e) => onChange({ utrNumber: e.target.value })}
              required
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="settlement-upi-id" className={styles.fieldLabel}>UPI ID / Phone (Optional)</label>
            <input
              id="settlement-upi-id"
              type="text"
              maxLength={100}
              className={styles.fieldInput}
              placeholder="e.g. depositor@upi"
              value={value.upiId}
              onChange={(e) => onChange({ upiId: e.target.value })}
            />
          </div>
        </div>
      )}

      {value.paymentMode === 'Bank Transfer' && (
        <>
          <div className={styles.grid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="settlement-bank-name" className={styles.fieldLabel}>Bank Name *</label>
              <input
                id="settlement-bank-name"
                type="text"
                maxLength={100}
                className={styles.fieldInput}
                placeholder={lenderBankName || 'e.g. State Bank of India'}
                value={value.bankName}
                onChange={(e) => onChange({ bankName: e.target.value })}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="settlement-branch-name" className={styles.fieldLabel}>Branch Name (Optional)</label>
              <input
                id="settlement-branch-name"
                type="text"
                maxLength={100}
                className={styles.fieldInput}
                placeholder="e.g. Mandi Branch"
                value={value.branchName}
                onChange={(e) => onChange({ branchName: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="settlement-account-no" className={styles.fieldLabel}>Account Number *</label>
              <input
                id="settlement-account-no"
                type="text"
                maxLength={35}
                className={styles.fieldInput}
                placeholder={loanReferenceNumber || 'e.g. 10029384721'}
                value={value.accountNumber}
                onChange={(e) => onChange({ accountNumber: e.target.value })}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="settlement-ifsc" className={styles.fieldLabel}>IFSC Code *</label>
              <input
                id="settlement-ifsc"
                type="text"
                maxLength={11}
                className={styles.fieldInput}
                placeholder="e.g. SBIN0001234"
                value={value.ifscCode}
                onChange={(e) => onChange({ ifscCode: e.target.value.toUpperCase() })}
                required
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="settlement-utr-bank" className={styles.fieldLabel}>Bank UTR / Transaction Ref # *</label>
            <input
              id="settlement-utr-bank"
              type="text"
              maxLength={50}
              className={styles.fieldInput}
              placeholder="e.g. UTR-20261005-098234"
              value={value.utrNumber}
              onChange={(e) => onChange({ utrNumber: e.target.value })}
              required
            />
          </div>
        </>
      )}

      <div className={styles.grid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="settlement-receiver-name" className={styles.fieldLabel}>Receiver / Collector Name *</label>
          <input
            id="settlement-receiver-name"
            type="text"
            maxLength={100}
            className={styles.fieldInput}
            placeholder="Official receiving settlement"
            value={value.receiverName}
            onChange={(e) => onChange({ receiverName: e.target.value })}
            required
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="settlement-receiver-aadhaar" className={styles.fieldLabel}>Receiver Aadhaar (Optional)</label>
          <input
            id="settlement-receiver-aadhaar"
            type="text"
            maxLength={12}
            className={styles.fieldInput}
            placeholder="12-digit Aadhaar number"
            value={value.receiverAadhaar}
            onChange={(e) => onChange({ receiverAadhaar: e.target.value.replace(/\D/g, '') })}
          />
        </div>
      </div>
    </div>
  );
}
