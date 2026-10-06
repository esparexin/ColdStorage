'use client';

import React from 'react';
import type { LoanStatus } from '@cold-storage/contracts';
import { Select } from '@/components/ui';
import styles from '../page.module.css';

interface BondLoanSectionProps {
  isBondForLoan: boolean;
  onIsBondForLoanChange: (value: boolean) => void;
  grnPreview: string;
  loanStatus: LoanStatus;
  onLoanStatusChange: (status: LoanStatus) => void;
}

export function BondLoanSection({
  isBondForLoan,
  onIsBondForLoanChange,
  grnPreview,
  loanStatus,
  onLoanStatusChange,
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
              Bond #
            </label>
            <input
              id="create-bond-number"
              type="text"
              readOnly
              tabIndex={-1}
              value={grnPreview || 'Auto'}
              className={`${styles.fieldInput} ${styles.calculatedField}`}
              aria-label="Bond # (GR Number)"
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
                ? 'var(--color-danger-subtle)'
                : 'var(--color-surface-2)',
            color:
              loanStatus === 'TAKEN'
                ? 'var(--color-danger-text)'
                : 'var(--color-text-muted)',
            border: `1px solid ${
              loanStatus === 'TAKEN'
                ? 'var(--color-danger)'
                : 'var(--color-border)'
            }`,
          }}
          role="status"
        >
          {loanStatus === 'TAKEN'
            ? '⚠️ Loan Taken: Outward Delivery will be strictly blocked for this Bond until the loan is cleared.'
            : 'ℹ️ Loan Not Taken: Outward Delivery remains available according to regular stock and rent rules.'}
        </div>
      )}
    </>
  );
}
