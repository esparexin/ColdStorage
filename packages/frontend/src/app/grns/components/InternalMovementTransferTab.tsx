'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Customer, Grn } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { useRentGate } from '@/hooks/useRentGate';
import styles from './InternalMovementModal.module.css';

interface InternalMovementTransferTabProps {
  currentGrn: Grn;
  facilityId: string;
  customers: Customer[];
  submitting: boolean;
  onExecuteTransfer: (
    newCustomerId: string,
    effectiveDate: string | undefined,
    reason: string,
    remarks?: string,
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
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
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
    const isoEffectiveDate = effectiveDate
      ? new Date(effectiveDate).toISOString()
      : undefined;

    await onExecuteTransfer(
      newCustomerId,
      isoEffectiveDate,
      reason.trim(),
      remarks.trim() || undefined,
    );
  };

  return (
    <form id="transfer-ownership-form" onSubmit={handleTransferSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}

      <div className={styles.columnsGrid}>
        {/* Column 1: Current Owner & GRN Details */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>1. Current Owner</span>
            <Badge variant="neutral">Existing</Badge>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Customer:</span>
            <span className={styles.detailValue}>{currentGrn.customerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>GRN Number:</span>
            <span className={styles.detailValue}>{currentGrn.grnNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Inward Date:</span>
            <span className={styles.detailValue}>
              {new Date(currentGrn.date).toLocaleDateString('en-IN')}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Commodity:</span>
            <span className={styles.detailValue}>{currentGrn.commodityName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Remaining Stock:</span>
            <span className={styles.detailValue}>{remainingBags} Bags</span>
          </div>
        </div>

        {/* Column 2: Financial Snapshot */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>2. Financial State</span>
            <Badge variant={pendingAmount > 0 ? 'warning' : 'success'}>
              {rentLoading ? 'Calculating...' : pendingAmount > 0 ? 'Dues Pending' : 'Settled'}
            </Badge>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Total Rent:</span>
            <span className={styles.detailValue}>₹{(rentSummary?.rentAmount ?? currentGrn.rentAmount).toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Paid / Settled:</span>
            <span className={styles.detailValue}>₹{totalPaid.toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Pending Dues:</span>
            <span className={styles.detailValue} style={{ color: pendingAmount > 0 ? 'var(--color-danger-text)' : 'inherit' }}>
              ₹{pendingAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className={styles.noticeBox}>
            Collected amount remains locked to historical Cash Memos. Pending obligation transfers to new owner.
          </div>
        </div>

        {/* Column 3: New Owner Assignment */}
        <div className={styles.resultColumnCard}>
          <div className={styles.columnHeader}>
            <span>3. New Owner</span>
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
          <div className={styles.formSection} style={{ marginTop: 0 }}>
            <label htmlFor="effective-date-input" className={styles.auditReasonLabel}>
              Effective Date *
            </label>
            <Input
              id="effective-date-input"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Assigned Transferee:</span>
            <span className={styles.detailValue}>{selectedNewCustomer ? selectedNewCustomer.name : '—'}</span>
          </div>
        </div>

        {/* Column 4: Audit & Governance Notice */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span>4. Governance & Audit</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span>
          </div>
          <div className={styles.formSection}>
            <label htmlFor="transfer-reason" className={styles.auditReasonLabel}>
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
            <label htmlFor="transfer-remarks" className={styles.auditReasonLabel}>
              Additional Remarks (Optional)
            </label>
            <textarea
              id="transfer-remarks"
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
