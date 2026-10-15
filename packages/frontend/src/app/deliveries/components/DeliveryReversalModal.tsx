'use client';

import React, { useState } from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface DeliveryReversalModalProps {
  facilityId: string;
  delivery: DeliveryChallan;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeliveryReversalModal({
  facilityId,
  delivery,
  onClose,
  onSuccess,
}: DeliveryReversalModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= 5 && trimmedReason.length <= 500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/deliveries/${encodeURIComponent(delivery.id)}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: trimmedReason }),
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || 'Failed to reverse delivery challan');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error reversing delivery challan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reverse Delivery Challan: ${delivery.challanNumber}`}
      subtitle={`GRN: ${delivery.grnNumber} • Customer: ${delivery.customerName}`}
      size="md"
      footer={
        <>
          <Button
            id="confirm-reversal-btn"
            variant="danger"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            isLoading={submitting}
          >
            Confirm Reversal
          </Button>
          <Button
            id="cancel-reversal-btn"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className={styles.modalBody}>
        {error && (
          <div role="alert" className={styles.modalError}>
            {error}
          </div>
        )}

        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Challan Number</span>
            <span className={styles.detailValue}>{delivery.challanNumber}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Total Bags</span>
            <span className={styles.detailValue}>
              {delivery.totalBags.toLocaleString('en-IN')} (
              {delivery.smallBags.toLocaleString('en-IN')}S /{' '}
              {delivery.bigBags.toLocaleString('en-IN')}B)
            </span>
          </div>
        </div>

        <div className={styles.loanHoldBanner}>
          <strong>Warning:</strong> Reversing this delivery will atomically credit{' '}
          {delivery.totalBags} bags back to GRN <strong>{delivery.grnNumber}</strong> stock ledger
          and mark this challan as <strong>REVERSED</strong>. This action is recorded in the audit log.
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-reversal-reason" className={styles.fieldLabel}>
            Reason for Reversal *
          </label>
          <textarea
            id="delivery-reversal-reason"
            required
            rows={3}
            className={styles.fieldInput}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this delivery is being reversed (min 5 characters)..."
            aria-describedby="delivery-reversal-help"
            minLength={5}
            maxLength={500}
            disabled={submitting}
          />
          <span id="delivery-reversal-help" className={styles.detailLabel}>
            Minimum 5 characters ({trimmedReason.length}/500)
          </span>
        </div>
      </form>
    </Modal>
  );
}
