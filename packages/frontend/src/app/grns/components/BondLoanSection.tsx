'use client';

import React from 'react';
import type { LoanStatus } from '@cold-storage/contracts';
import { Select } from '@/components/ui';
import styles from '../page.module.css';

interface BondLoanSectionProps {
  isBondForLoan: boolean;
  onIsBondForLoanChange: (value: boolean) => void;
  bondNumber?: string;
  onBondNumberChange?: (v: string) => void;
  loanStatus: LoanStatus;
  onLoanStatusChange: (status: LoanStatus) => void;
  loanBankName: string;
  onLoanBankNameChange: (v: string) => void;
  loanReferenceNumber: string;
  onLoanReferenceNumberChange: (v: string) => void;
  loanRemarks: string;
  onLoanRemarksChange: (v: string) => void;
}

export function BondLoanSection({
  isBondForLoan,
  onIsBondForLoanChange,
  bondNumber,
  onBondNumberChange,
  loanStatus,
  onLoanStatusChange,
  loanBankName,
  onLoanBankNameChange,
  loanReferenceNumber,
  onLoanReferenceNumberChange,
  loanRemarks,
  onLoanRemarksChange,
}: BondLoanSectionProps) {
  return (
    <>
      <h3 className={styles.sectionHeading}>Bond &amp; Loan Control</h3>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <Select
            id="create-is-bond-for-loan"
            label="Bond for Loan / Pledge"
            value={isBondForLoan ? 'YES' : 'NO'}
            onChange={(e) => {
              const yes = e.target.value === 'YES';
              onIsBondForLoanChange(yes);
              if (!yes) {
                onLoanStatusChange('NONE');
              } else if (loanStatus === 'NONE') {
                onLoanStatusChange('NOT_TAKEN');
              }
            }}
          >
            <option value="NO">No — Standard Storage (Outward Available)</option>
            <option value="YES">Yes — Bond for Loan / Pledging</option>
          </Select>
        </div>

        {isBondForLoan && (
          <div className={styles.fieldGroup}>
            <Select
              id="create-loan-status"
              label="Loan Disbursement Status"
              value={loanStatus === 'TAKEN' ? 'TAKEN' : 'NOT_TAKEN'}
              onChange={(e) => onLoanStatusChange(e.target.value as LoanStatus)}
            >
              <option value="NOT_TAKEN">No — Loan Not Taken (Pledge only, outward allowed)</option>
              <option value="TAKEN">Yes — Loan Taken (Immediate Loan Hold, outward blocked)</option>
            </Select>
          </div>
        )}

        {isBondForLoan && (
          <div className={styles.fieldGroup}>
            <label htmlFor="create-bond-number" className={styles.fieldLabel}>
              Bond # (Optional / Auto-generated)
            </label>
            <input
              id="create-bond-number"
              type="text"
              maxLength={40}
              placeholder="e.g. BND-26-27-0001 (Blank = Auto)"
              className={styles.fieldInput}
              value={bondNumber || ''}
              onChange={(e) => onBondNumberChange?.(e.target.value)}
            />
          </div>
        )}
      </div>

      {isBondForLoan && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            marginBottom: 'var(--space-3)',
            background:
              loanStatus === 'TAKEN'
                ? 'var(--color-danger-subtle, #fef2f2)'
                : 'var(--color-surface-2, #f8fafc)',
            color:
              loanStatus === 'TAKEN'
                ? 'var(--color-danger, #b91c1c)'
                : 'var(--color-text-muted, #64748b)',
            border: `1px solid ${
              loanStatus === 'TAKEN'
                ? 'var(--color-danger-border, #fca5a5)'
                : 'var(--color-border, #e2e8f0)'
            }`,
          }}
          role="status"
        >
          {loanStatus === 'TAKEN'
            ? '⚠️ Loan Taken: Outward Delivery will be strictly blocked for this Bond until the loan is cleared.'
            : 'ℹ️ Loan Not Taken: Outward Delivery remains available according to regular stock and rent rules.'}
        </div>
      )}

      {isBondForLoan && loanStatus === 'TAKEN' && (
        <div className={styles.formGrid2}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-loan-bank" className={styles.fieldLabel}>
              Lender / Bank Name
            </label>
            <input
              id="create-loan-bank"
              type="text"
              maxLength={100}
              placeholder="e.g. State Bank of India"
              className={styles.fieldInput}
              value={loanBankName}
              onChange={(e) => onLoanBankNameChange(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="create-loan-ref" className={styles.fieldLabel}>
              Loan / Pledge Account #
            </label>
            <input
              id="create-loan-ref"
              type="text"
              maxLength={50}
              placeholder="e.g. LN-2026-0042"
              className={styles.fieldInput}
              value={loanReferenceNumber}
              onChange={(e) => onLoanReferenceNumberChange(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup} style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="create-loan-remarks" className={styles.fieldLabel}>
              Loan Notes &amp; Terms
            </label>
            <input
              id="create-loan-remarks"
              type="text"
              maxLength={500}
              placeholder="e.g. Pledged against seasonal crop advance"
              className={styles.fieldInput}
              value={loanRemarks}
              onChange={(e) => onLoanRemarksChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </>
  );
}
