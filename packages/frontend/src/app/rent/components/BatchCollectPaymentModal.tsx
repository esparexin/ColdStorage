'use client';

import React from 'react';
import { CreditCard, Wallet, Layers } from 'lucide-react';
import type { RecordBatchRentPaymentResult, RentSummaryDto } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { BatchGrnAllocationTable } from './BatchGrnAllocationTable';
import { useBatchCollectPaymentForm } from '../hooks/useBatchCollectPaymentForm';
import styles from '../page.module.css';

interface BatchCollectPaymentModalProps {
  accounts: RentSummaryDto[];
  selectedFacilityId: string;
  onClose: () => void;
  onPaymentSuccess: (result: RecordBatchRentPaymentResult) => void;
}

export function BatchCollectPaymentModal({
  accounts,
  selectedFacilityId,
  onClose,
  onPaymentSuccess,
}: BatchCollectPaymentModalProps) {
  const {
    customerOptions,
    selectedCustomerId,
    handleCustomerChange,
    customerGrns,
    totalAmount,
    setTotalAmount,
    allocations,
    handleAllocationChange,
    handleAutoAllocate,
    totalOutstanding,
    totalAllocated,
    pendingAfterPayment,
    paymentMode,
    setPaymentMode,
    paymentDate,
    setPaymentDate,
    notes,
    setNotes,
    upiReference,
    setUpiReference,
    error,
    submitting,
    isDirty,
    handleSubmit,
  } = useBatchCollectPaymentForm({
    accounts,
    selectedFacilityId,
    onSuccess: (result) => {
      onPaymentSuccess(result);
      onClose();
    },
  });

  const { attemptExit, isConfirmOpen, confirmExit, cancelExit } = useUnsavedChanges(
    isDirty && !submitting,
  );

  return (
    <>
      <Modal
        isOpen
        onClose={() => attemptExit(onClose)}
        title="Batch Rent Settlement"
        subtitle="Settle rent obligations across multiple GRNs for a single customer"
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <Banner message={error} id="batch-collect-error" />}

            <div className={styles.fieldGroup}>
              <label htmlFor="batch-customer-select" className={styles.fieldLabel}>
                Select Customer with Rent Dues *
              </label>
              <Select
                id="batch-customer-select"
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                disabled={submitting}
              >
                {customerOptions.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.customerName} ({c.openGrnCount} GRN{c.openGrnCount > 1 ? 's' : ''} · ₹{c.totalOutstandingBalance.toLocaleString('en-IN')})
                  </option>
                ))}
              </Select>
            </div>

            {selectedCustomerId && customerGrns.length > 0 && (
              <>
                <div className={styles.infoCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                      Total Outstanding Dues: ₹{totalOutstanding.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {customerGrns.length} Open GRN{customerGrns.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <input
                      id="batch-total-amount"
                      aria-label="Total amount to settle"
                      type="number"
                      min={0}
                      className={styles.input}
                      placeholder="Total amount to settle (₹)"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={submitting}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAutoAllocate}
                      disabled={submitting}
                    >
                      <Layers style={{ width: 14, height: 14, marginRight: 'var(--space-1)' }} />
                      Auto Allocate
                    </Button>
                  </div>
                </div>

                <BatchGrnAllocationTable
                  customerGrns={customerGrns}
                  allocations={allocations}
                  onChange={handleAllocationChange}
                  disabled={submitting}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
                    Total Allocating: <strong>₹{totalAllocated.toLocaleString('en-IN')}</strong>
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Pending Remaining: ₹{pendingAfterPayment.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Payment Mode *</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="batch-paymentMode"
                        value="Cash"
                        checked={paymentMode === 'Cash'}
                        onChange={() => setPaymentMode('Cash')}
                        disabled={submitting}
                      />
                      <Wallet style={{ width: 14, height: 14 }} />
                      Cash
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="batch-paymentMode"
                        value="UPI"
                        checked={paymentMode === 'UPI'}
                        onChange={() => setPaymentMode('UPI')}
                        disabled={submitting}
                      />
                      <CreditCard style={{ width: 14, height: 14 }} />
                      UPI
                    </label>
                  </div>
                </div>

                {paymentMode === 'UPI' && (
                  <div className={styles.fieldGroup}>
                    <label htmlFor="batch-upi-reference" className={styles.fieldLabel}>
                      UPI Reference / Transaction ID *
                    </label>
                    <input
                      id="batch-upi-reference"
                      type="text"
                      className={styles.input}
                      placeholder="e.g. UPI-1234567890"
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                )}

                <div className={styles.fieldGroup}>
                  <label htmlFor="batch-payment-date" className={styles.fieldLabel}>Payment Date *</label>
                  <input
                    id="batch-payment-date"
                    type="date"
                    className={styles.input}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="batch-collect-notes" className={styles.fieldLabel}>Notes / Remarks</label>
                  <input
                    id="batch-collect-notes"
                    type="text"
                    className={styles.input}
                    placeholder="Optional settlement notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </>
            )}

            <div className={styles.modalFooter}>
              <Button type="button" variant="secondary" onClick={() => attemptExit(onClose)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} disabled={totalAllocated <= 0}>
                Collect Batch (₹{totalAllocated.toLocaleString('en-IN')})
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Discard Unsaved Changes?"
        message="You have unsaved batch payment allocations. Discard changes?"
        confirmLabel="Discard & Close"
        cancelLabel="Continue Editing"
        confirmVariant="danger"
        onConfirm={confirmExit}
        onCancel={cancelExit}
      />
    </>
  );
}
