'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, Grn, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { useRentGate } from '@/hooks/useRentGate';
import { TransferPaymentDecisionSection, validateTransferPayment } from './TransferPaymentDecisionSection';
import styles from './InternalMovementModal.module.css';

interface InternalMovementTransferTabProps {
  currentGrn: Grn;
  facilityId: string;
  customers: Customer[];
  submitting: boolean;
  onExecuteTransfer: (
    newCustomerId: string,
    movementDate: string,
    reason: string,
    remarks?: string,
    paymentDecision?: TransferPaymentDecision,
    settlementDetails?: TransferSettlementDetails,
  ) => Promise<void>;
}

export function InternalMovementTransferTab({
  currentGrn,
  facilityId,
  customers,
  submitting,
  onExecuteTransfer,
}: InternalMovementTransferTabProps) {
  const [newCustomerId, setNewCustomerId] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<'AGREED_PENDING' | 'SETTLE_NOW'>('SETTLE_NOW');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { rentSummary, rentLoading, refreshRentGate } = useRentGate();

  useEffect(() => {
    void refreshRentGate(facilityId, currentGrn.id);
  }, [facilityId, currentGrn.id, refreshRentGate]);

  const candidateCustomers = useMemo(
    () => customers.filter((c) => c.id !== currentGrn.customerId && c.isActive),
    [customers, currentGrn.customerId],
  );

  const selectedNewCustomer = useMemo(
    () => candidateCustomers.find((c) => c.id === newCustomerId),
    [candidateCustomers, newCustomerId],
  );

  const remainingBags = currentGrn.closingBags ?? currentGrn.bags;
  const totalPaid = rentSummary?.totalPaid ?? 0;
  const pendingAmount = rentSummary?.remainingBalance ?? 0;
  const isUnbilled = totalPaid === 0 && pendingAmount === 0 && (rentSummary?.rentAmount ?? 0) === 0;

  useEffect(() => {
    if (pendingAmount > 0) {
      setDecision('SETTLE_NOW');
      if (settleAmount === 0) setSettleAmount(pendingAmount);
    }
  }, [pendingAmount, settleAmount]);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!newCustomerId) {
      setValidationError('Select the new customer to transfer ownership to.');
      return;
    }
    if (reason.trim().length < 5) {
      setValidationError('Audit reason must be at least 5 characters.');
      return;
    }
    const payErr = validateTransferPayment(decision, settleAmount, pendingAmount);
    if (payErr) {
      setValidationError(payErr);
      return;
    }

    await onExecuteTransfer(
      newCustomerId,
      movementDate,
      reason.trim(),
      remarks.trim() || undefined,
      pendingAmount > 0 ? decision : undefined,
      pendingAmount > 0 && decision === 'SETTLE_NOW'
        ? { amountPaid: settleAmount, paymentMode }
        : undefined,
    );
  };

  return (
    <form id="transfer-ownership-form" onSubmit={handleTransferSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}

      {/* Current Owner & GRN Compact Summary Strip */}
      <div className={styles.summaryStrip}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Current Owner</span>
          <span className={styles.metaValue}>{currentGrn.customerName}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>GRN Number</span>
          <span className={styles.metaValue}>{currentGrn.grnNumber}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Inward Date</span>
          <span className={styles.metaValue}>{new Date(currentGrn.date).toLocaleDateString('en-IN')}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Commodity / Chamber</span>
          <span className={styles.metaValue}>{currentGrn.commodityName} (Ch. {currentGrn.chamber})</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Remaining Stock</span>
          <span className={styles.metaValue}>{remainingBags} Bags</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Rent State</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span className={styles.metaValue}>
              {isUnbilled
                ? '₹0 due (At Outward / Dynamic)'
                : `₹${totalPaid.toLocaleString('en-IN')} paid / ₹${pendingAmount.toLocaleString('en-IN')} due`}
            </span>
            <Badge variant={isUnbilled ? 'neutral' : pendingAmount > 0 ? 'warning' : 'success'}>
              {rentLoading ? '...' : isUnbilled ? 'Unbilled' : pendingAmount > 0 ? 'Pending Dues' : 'Settled'}
            </Badge>
          </div>
        </div>
      </div>

      <TransferPaymentDecisionSection
        pendingAmount={pendingAmount}
        decision={decision}
        onDecisionChange={setDecision}
        settleAmount={settleAmount}
        onSettleAmountChange={setSettleAmount}
        paymentMode={paymentMode}
        onPaymentModeChange={setPaymentMode}
        disabled={submitting}
      />

      {/* Transfer Specification & Governance Grid */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>1. New Owner Assignment</span>
            <Badge variant="primary">Transfer</Badge>
          </div>
          <Select
            id="new-customer-selector"
            label="Select New Customer *"
            value={newCustomerId}
            onChange={(e) => setNewCustomerId(e.target.value)}
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

          <div className={styles.formSection}>
            <label htmlFor="transfer-movement-date" className={styles.inputLabel}>
              Movement Date *
            </label>
            <Input
              id="transfer-movement-date"
              type="date"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Assigned Transferee:</span>
            <span className={styles.detailValue}>{selectedNewCustomer ? selectedNewCustomer.name : '—'}</span>
          </div>

          <div className={styles.noticeBox}>
            {pendingAmount > 0
              ? decision === 'SETTLE_NOW'
                ? `Rent (₹${settleAmount}) will be settled now with receipt generated.`
                : `Transferee agreed to assume pending rent: ₹${pendingAmount.toLocaleString('en-IN')}.`
              : 'Rent obligation is fully settled for this lot.'}
          </div>
        </div>

        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>2. Governance & Audit</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span>
          </div>

          <div className={styles.formSection}>
            <label htmlFor="transfer-reason" className={styles.inputLabel}>
              Audit Reason (min 5 chars) *
            </label>
            <Input
              id="transfer-reason"
              placeholder="e.g. Sale of lot / Farmer transfer"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className={styles.formSection}>
            <label htmlFor="transfer-remarks" className={styles.inputLabel}>
              Additional Remarks (Optional)
            </label>
            <textarea
              id="transfer-remarks"
              aria-label="Additional Remarks"
              rows={2}
              className={styles.textarea}
              placeholder="Internal notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.noticeBox}>
            New owner must clear all outstanding GRN obligations prior to dispatch/delivery.
          </div>
        </div>
      </div>
    </form>
  );
}
