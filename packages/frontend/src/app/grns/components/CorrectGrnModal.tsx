'use client';

import React, { useState } from 'react';
import type { Commodity, Grn } from '@cold-storage/contracts';
import { Banner, Button, Input, Modal, Select } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface CorrectGrnModalProps {
  grn: Grn;
  facilityId: string;
  commodities: Commodity[];
  movementGuard?: { hasMovement: boolean; hasActiveIssued: boolean } | null;
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
}

export function CorrectGrnModal({
  grn,
  facilityId,
  commodities,
  movementGuard = null,
  onClose,
  onSuccess,
}: CorrectGrnModalProps) {
  const isClosed = grn.status === 'CLOSED';
  // Backend SSOT (update-grn.handler): ANY challan/reversal history freezes bags/commodity
  // (even after full reversal); an active ISSUED challan blocks every correction.
  // movementGuard carries the ledger-derived verdict; without it use the receipt heuristic.
  const hasMovement =
    (movementGuard?.hasMovement ?? false) || isClosed || (grn.netDeliveredBags ?? 0) > 0;
  const fieldsLocked = isClosed || hasMovement;
  // Single source for the guard reason: submit errors and the notice banner read the same text.
  const guardMessages = {
    closed: `Cannot correct GRN '${grn.grnNumber}': it is CLOSED and its stock has been fully delivered.`,
    blocked: `Cannot correct GRN '${grn.grnNumber}': stock has already been delivered. Use the delivery reversal workflow instead.`,
    locked: 'Stock has already moved against this GRN. Commodity and Bag counts are locked to preserve ledger integrity. Only the Chamber label may be corrected.',
  };
  const activeBlocked = movementGuard?.hasActiveIssued ?? false;
  const guardState =
    isClosed ? 'closed' : activeBlocked ? 'blocked' : fieldsLocked ? 'locked' : null;
  const [commodityId, setCommodityId] = useState(grn.commodityId);
  const [chamber, setChamber] = useState(grn.chamber);
  const [bags, setBags] = useState<number | ''>(grn.bags);
  const [smallBags, setSmallBags] = useState<number | ''>(grn.smallBags ?? 0);
  const [bigBags, setBigBags] = useState<number | ''>(grn.bigBags ?? 0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMixed = grn.bagType === 'S+B';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (guardState === 'closed' || guardState === 'blocked') {
      setError(guardMessages[guardState]);
      return;
    }
    const trimmedChamber = chamber.trim();
    const trimmedReason = reason.trim();

    if (!trimmedChamber || trimmedChamber.length > 20) {
      setError('Chamber label is required (max 20 characters).');
      return;
    }
    if (trimmedReason.length < 5) {
      setError('A correction reason of at least 5 characters is required by audit policy.');
      return;
    }

    const payload: Record<string, unknown> = { reason: trimmedReason };
    let hasChange = trimmedChamber !== grn.chamber;
    if (hasChange) payload.chamber = trimmedChamber;

    if (!fieldsLocked) {
      if (commodityId !== grn.commodityId) {
        payload.commodityId = commodityId;
        hasChange = true;
      }
      if (isMixed) {
        const sVal = Number(smallBags) || 0;
        const bVal = Number(bigBags) || 0;
        if (sVal < 0 || bVal < 0 || sVal + bVal <= 0) {
          setError('Small and big bags must sum to a positive integer.');
          return;
        }
        if (sVal !== (grn.smallBags ?? 0) || bVal !== (grn.bigBags ?? 0)) {
          payload.bags = sVal + bVal;
          payload.smallBags = sVal;
          payload.bigBags = bVal;
          hasChange = true;
        }
      } else {
        const bVal = Number(bags) || 0;
        if (bVal <= 0) {
          setError('Bag quantity must be a positive integer.');
          return;
        }
        if (bVal !== grn.bags) {
          payload.bags = bVal;
          hasChange = true;
        }
      }
    }

    if (!hasChange) {
      setError('No changes detected. Modify at least one field or click Cancel.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grn.id)}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to update GRN');
      }
      const data = (await res.json()) as { grn: Grn };
      onSuccess(data.grn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while updating the GRN');
    } finally {
      setSubmitting(false);
    }
  };

  const activeCommodities = commodities.filter((c) => c.isActive || c.id === grn.commodityId);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit / Correct GRN: ${grn.grnNumber}`}
      subtitle={`Customer: ${grn.customerName} • Receipt #${grn.inwardReceiptNumber}`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary" size="sm" onClick={handleSubmit} isLoading={submitting}
            disabled={submitting || guardState === 'closed' || guardState === 'blocked'}
          >
            Save Corrections
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        {error && <Banner message={error} />}
        {guardState && <Banner message={guardMessages[guardState]} />}
        <div className={styles.formGroup}>
          <Select
            id="grn-edit-commodity"
            label="Commodity"
            value={commodityId}
            onChange={(e) => setCommodityId(e.target.value)}
            disabled={fieldsLocked || submitting}
          >
            {activeCommodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{!c.isActive ? ' (Inactive)' : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.formGroup}>
          <Input
            id="grn-edit-chamber"
            label="Chamber Location (Max 20 chars)"
            value={chamber}
            maxLength={20}
            onChange={(e) => setChamber(e.target.value)}
            disabled={submitting}
            required
          />
        </div>
        {isMixed ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <div className={styles.formGroup}>
              <Input
                id="grn-edit-small-bags"
                label="Small Bags"
                type="number"
                min={0}
                value={smallBags}
                onChange={(e) => setSmallBags(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={fieldsLocked || submitting}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <Input
                id="grn-edit-big-bags"
                label="Big Bags"
                type="number"
                min={0}
                value={bigBags}
                onChange={(e) => setBigBags(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={fieldsLocked || submitting}
                required
              />
            </div>
          </div>
        ) : (
          <div className={styles.formGroup}>
            <Input
              id="grn-edit-bags"
              label={`Bags (${grn.bagType === 'S' ? 'Small' : 'Big'})`}
              type="number"
              min={1}
              value={bags}
              onChange={(e) => setBags(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={fieldsLocked || submitting}
              required
            />
          </div>
        )}
        {isMixed && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'calc(-1 * var(--space-2))' }}>
            Total Bags: <strong>{(Number(smallBags) || 0) + (Number(bigBags) || 0)}</strong>
          </div>
        )}
        <div className={styles.formGroup}>
          <label htmlFor="grn-correction-reason" className={styles.fieldLabel}>
            Correction Reason <span style={{ color: 'var(--color-danger-text)' }}>*</span>
          </label>
          <textarea
            id="grn-correction-reason"
            className={styles.input}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Administrative correction reason (required by audit policy, min 5 chars)..."
            required
            aria-required="true"
            disabled={submitting}
          />
        </div>
      </form>
    </Modal>
  );
}
