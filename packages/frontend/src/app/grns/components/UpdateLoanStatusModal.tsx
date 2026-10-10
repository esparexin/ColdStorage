'use client';

import React, { useState } from 'react';
import type { Grn, LoanStatus } from '@cold-storage/contracts';
import { Badge, Button, Modal, Select } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { LoanSettlementFields } from './LoanSettlementFields';
import {
  initSettlementState,
  validateLoanSettlement,
  buildSettlementPayload,
} from '../hooks/loanSettlement.helper';
import styles from '../page.module.css';

interface UpdateLoanStatusModalProps {
  grn: Grn;
  facilityId: string;
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
}

export function UpdateLoanStatusModal({
  grn,
  facilityId,
  onClose,
  onSuccess,
}: UpdateLoanStatusModalProps) {
  const [targetStatus, setTargetStatus] = useState<LoanStatus>(() => {
    return grn.loanStatus === 'TAKEN' ? 'CLEARED' : 'TAKEN';
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState(() => initSettlementState(grn));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (targetStatus === 'CLEARED') {
      const validationError = validateLoanSettlement(settlement);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Settlement is the only place loan payment details and notes are captured.
      const payload: Record<string, unknown> = { loanStatus: targetStatus };

      if (targetStatus === 'CLEARED') {
        payload.settlement = buildSettlementPayload(settlement);
      }

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grn.id)}/loan-status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || 'Failed to update loan status');
      }

      const data = (await res.json()) as { grn: Grn };
      onSuccess(data.grn);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating loan status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Bond Loan Control: ${grn.grnNumber}`}
      subtitle={`${grn.customerName} — ${grn.commodityName} (${grn.bags.toLocaleString('en-IN')} Bags)`}
      size={targetStatus === 'CLEARED' ? 'lg' : 'md'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="update-loan-status-form"
            variant={targetStatus === 'CLEARED' ? 'primary' : 'secondary'}
            isLoading={submitting}
            disabled={submitting}
          >
            {targetStatus === 'CLEARED' ? 'Confirm Loan Settlement' : 'Save Loan Status'}
          </Button>
        </>
      }
    >
      <form id="update-loan-status-form" onSubmit={handleSubmit} className={styles.modalForm}>
        {error && (
          <div id="loan-status-error" className={styles.modalError} role="alert">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Current Status:</span>
          <Badge
            variant={
              grn.loanStatus === 'TAKEN'
                ? 'danger'
                : grn.loanStatus === 'CLEARED'
                  ? 'success'
                  : 'neutral'
            }
          >
            {grn.loanStatus === 'TAKEN'
              ? 'Loan Active (Hold)'
              : grn.loanStatus === 'CLEARED'
                ? 'Loan Cleared'
                : grn.loanStatus === 'NOT_TAKEN'
                  ? 'Loan Not Taken'
                  : 'Standard Storage'}
          </Badge>
        </div>

        <div className={styles.fieldGroup}>
          <Select
            id="loan-target-status"
            label="Action / New Loan Status"
            value={targetStatus}
            onChange={(e) => setTargetStatus(e.target.value as LoanStatus)}
          >
            {grn.loanStatus === 'TAKEN' && (
              <option value="CLEARED">Loan Cleared (Record Payment &amp; Lift Outward Hold)</option>
            )}
            <option value="TAKEN">Loan Taken (Active Lien — Block Outward Delivery)</option>
            <option value="NOT_TAKEN">Loan Not Taken (Pledge Only — Allow Outward Delivery)</option>
            {grn.loanStatus !== 'TAKEN' && (
              <option value="CLEARED">Loan Cleared (Settled)</option>
            )}
          </Select>
        </div>

        {targetStatus === 'CLEARED' && (
          <LoanSettlementFields
            value={settlement}
            onChange={(u) => setSettlement((prev) => ({ ...prev, ...u }))}
          />
        )}
      </form>
    </Modal>
  );
}
