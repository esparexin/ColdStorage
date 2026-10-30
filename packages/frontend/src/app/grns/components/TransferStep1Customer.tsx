'use client';

import React, { useState } from 'react';
import { Users } from 'lucide-react';
import type { Customer, Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { CustomerCombobox } from './CustomerCombobox';
import { useCustomerCombobox } from '../hooks/useCustomerCombobox';
import { CustomerFormModal } from '../../customers/components/CustomerFormModal';
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
  facilityId?: string;
  onCustomerAdded?: (customer?: Customer) => void;
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
  facilityId,
  onCustomerAdded,
}: TransferStep1CustomerProps) {
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  const customerBox = useCustomerCombobox(
    candidateCustomers,
    newCustomerId,
    onNewCustomerIdChange,
    () => setIsAddingCustomer(true),
    { showAllByDefault: false },
  );

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

        <CustomerCombobox
          customerBox={customerBox}
          customerId={newCustomerId}
          customers={candidateCustomers}
          id="new-customer-selector"
          label="Select New Customer"
          required
          addLabel="+ Add Customer"
          placeholder="Search customer by name…"
          emptyPrompt="Type customer name to search…"
          isLoading={rentLoading}
          disabled={submitting}
          onAddCustomer={() => setIsAddingCustomer(true)}
        />

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

      {isAddingCustomer && (
        <CustomerFormModal
          customer={null}
          selectedFacilityId={facilityId ?? null}
          existingCustomers={candidateCustomers}
          onClose={() => setIsAddingCustomer(false)}
          onSuccess={(newCustomer) => {
            setIsAddingCustomer(false);
            if (newCustomer) {
              onNewCustomerIdChange(newCustomer.id);
            }
            onCustomerAdded?.(newCustomer);
          }}
        />
      )}
    </div>
  );
}
