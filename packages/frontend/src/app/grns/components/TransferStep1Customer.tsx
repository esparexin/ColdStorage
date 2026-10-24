'use client';

import React from 'react';
import { Users } from 'lucide-react';
import type { Customer, Grn } from '@cold-storage/contracts';
import { Badge, Select } from '@/components/ui';
import { TransferSummaryStrip } from './TransferSummaryStrip';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface TransferStep1CustomerProps {
  currentGrn: Grn;
  remainingBags: number;
  totalPaid: number;
  pendingAmount: number;
  isUnbilled: boolean;
  rentLoading: boolean;
  newCustomerId: string;
  onNewCustomerIdChange: (id: string) => void;
  candidateCustomers: Customer[];
  selectedNewCustomer?: Customer;
  submitting: boolean;
  onNext: () => void;
}

export function TransferStep1Customer({
  currentGrn,
  remainingBags,
  totalPaid,
  pendingAmount,
  isUnbilled,
  rentLoading,
  newCustomerId,
  onNewCustomerIdChange,
  candidateCustomers,
  selectedNewCustomer,
  submitting,
  onNext,
}: TransferStep1CustomerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <TransferSummaryStrip
        currentGrn={currentGrn}
        remainingBags={remainingBags}
        totalPaid={totalPaid}
        pendingAmount={pendingAmount}
        isUnbilled={isUnbilled}
        rentLoading={rentLoading}
      />

      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} aria-hidden="true" />
            <span>1. New Owner Assignment</span>
          </span>
          <Badge variant="primary">Transferee</Badge>
        </div>

        <Select
          id="new-customer-selector"
          label="Select New Customer *"
          value={newCustomerId}
          onChange={(e) => onNewCustomerIdChange(e.target.value)}
          disabled={submitting}
          required
        >
          <option value="">-- Choose New Owner --</option>
          {candidateCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {selectedNewCustomer && (
          <div className={styles.detailRow} style={{ marginTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Assigned Transferee:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
              {selectedNewCustomer.name}
            </span>
          </div>
        )}
      </div>

      <WizardStepActions
        stepInfoText="Step 1 of 3 • Choose the recipient customer"
        onNext={onNext}
        nextLabel="Next: Confirm Bag Type & Dues"
        disabled={!newCustomerId}
        submitting={submitting}
      />
    </div>
  );
}
