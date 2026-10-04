'use client';

import React, { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
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
  const [reversalReason, setReversalReason] = useState('');
  const [reversalSubmitting, setReversalSubmitting] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId || !delivery) return;

    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setReversalError('Reversal reason must be at least 5 characters');
      return;
    }

    setReversalSubmitting(true);
    setReversalError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/deliveries/${encodeURIComponent(delivery.id)}/reverse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reversalReason.trim() }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Reversal failed with HTTP ${res.status}`);
      }

      onSuccess();
    } catch (err: unknown) {
      setReversalError(err instanceof Error ? err.message : 'Delivery reversal failed');
    } finally {
      setReversalSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Confirm Full Reversal: ${delivery.challanNumber}`}
      size="md"
    >
      <form onSubmit={handleReverseSubmit}>
        <div className={styles.modalBody}>
          {reversalError && <div className={styles.modalError}>{reversalError}</div>}

          <div className={styles.warningBox}>
            <AlertTriangle size={24} style={{ flexShrink: 0 }} aria-hidden="true" />
            <div>
              <strong>Warning: Full Reversal is Irreversible.</strong>
              <p style={{ marginTop: '4px' }}>
                Reversing this delivery will restore {delivery.totalBags} bags (
                {delivery.smallBags} small, {delivery.bigBags} big) to this GRN&apos;s
                balance and append an immutable <code>DELIVERY_REVERSAL</code> event to the
                stock ledger.
              </p>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="reversal-reason" className={styles.fieldLabel}>
              Reason for Reversal *
            </label>
            <textarea aria-label="Provide a mandatory operational justification (minimum 5..."
              id="reversal-reason"
              required
              rows={3}
              minLength={5}
              maxLength={500}
              className={styles.fieldInput}
              placeholder="Provide a mandatory operational justification (minimum 5 characters)..."
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={reversalSubmitting}
          >
            Cancel
          </Button>
          <Button
            id="confirm-reversal-btn"
            type="submit"
            variant="danger"
            disabled={reversalSubmitting || reversalReason.trim().length < 5}
            isLoading={reversalSubmitting}
            leftIcon={!reversalSubmitting ? <RotateCcw size={15} aria-hidden="true" /> : undefined}
          >
            Confirm Full Reversal
          </Button>
        </div>
      </form>
    </Modal>
  );
}
