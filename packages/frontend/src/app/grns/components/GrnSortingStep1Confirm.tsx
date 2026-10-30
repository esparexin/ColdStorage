'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  toOperationalBagType,
  type Grn,
  type OperationalBagType,
  type PaymentMode,
  type SortGrnInput,
  type SortGrnResult,
} from '@cold-storage/contracts';
import { Button, Input, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { validateSortConfirmation } from './grnSorting.helper';
import styles from './GrnSortingModal.module.css';

interface GrnSortingStep1ConfirmProps {
  grn: Grn;
  submitting: boolean;
  onConfirmAndBill: (input: SortGrnInput) => Promise<void>;
  sortingResult: SortGrnResult | null;
  onProceedToRepack: () => void;
}

export function GrnSortingStep1Confirm({
  grn,
  submitting,
  onConfirmAndBill,
  sortingResult,
  onProceedToRepack,
}: GrnSortingStep1ConfirmProps) {
  const availableBags = grn.closingBags ?? grn.bags;
  const [confirmedBagType, setConfirmedBagType] = useState<OperationalBagType>(
    toOperationalBagType(grn.bagType),
  );
  const isHybrid = confirmedBagType === 'Hybrid';
  const [confirmedSmallBags, setConfirmedSmallBags] = useState<string>(
    grn.smallBags != null ? String(grn.smallBags) : String(availableBags),
  );
  const [confirmedBigBags, setConfirmedBigBags] = useState<string>(
    grn.bigBags != null ? String(grn.bigBags) : '0',
  );
  const [totalWeight, setTotalWeight] = useState<string>(
    grn.totalBagsWeight != null ? String(grn.totalBagsWeight) : '',
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const parsedSmall = isHybrid ? null : Number(confirmedSmallBags);
    const parsedBig = isHybrid ? null : Number(confirmedBigBags);
    const parsedBags = isHybrid ? availableBags : (parsedSmall ?? 0) + (parsedBig ?? 0);
    const parsedWeight = totalWeight.trim() ? Number(totalWeight) : null;

    const error = validateSortConfirmation(
      {
        confirmedBagType,
        confirmedBags: parsedBags,
        confirmedSmallBags: parsedSmall,
        confirmedBigBags: parsedBig,
        totalBagsWeight: parsedWeight,
        paymentMode,
      },
      grn.bagType,
      availableBags,
    );

    if (error) {
      setValidationError(error);
      return;
    }

    await onConfirmAndBill({
      grnId: grn.id,
      confirmedBagType,
      confirmedBags: parsedBags,
      totalBagsWeight: parsedWeight,
      paymentMode,
      paymentNotes: paymentNotes.trim() || undefined,
    });
  };

  return (
    <div className={styles.modalContainer}>
      {validationError && <Banner message={validationError} id="sorting-validation-banner" />}

      {sortingResult?.isSortingComplete ? (
        <div className={styles.billSuccessNotice}>
          <div className={styles.billTitle}>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>Sorting Confirmed &amp; Rent Obligation Settled</span>
          </div>
          <div className={styles.billDetailRow}>
            <span>Receipt Number:</span>
            <strong>{sortingResult.receiptNumber || 'N/A (Zero dues)'}</strong>
          </div>
          <div className={styles.billDetailRow}>
            <span>Billed Amount:</span>
            <strong>₹{sortingResult.billedAmount.toFixed(2)}</strong>
          </div>
          <div style={{ marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              id="proceed-to-repack-btn"
              variant="primary"
              size="sm"
              onClick={onProceedToRepack}
            >
              Continue to Repacking/Rebagging →
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.formCard}>
          <div className={styles.formCardTitle}>Step 1: Confirm Existing Lot &amp; Generate Rent Bill</div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
            Verify the existing lot details below. Rent obligation will be recalculated and billed before repacking is enabled.
          </p>

          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <Select
                id="confirmed-bag-type"
                label="Confirm Bag Type *"
                value={confirmedBagType}
                onChange={(e) => setConfirmedBagType(e.target.value as OperationalBagType)}
                required
              >
                <option value="S/B">S/B (Small / Big)</option>
                <option value="Hybrid">Hybrid</option>
              </Select>
            </div>

            {isHybrid ? (
              <div className={styles.fieldGroup}>
                <Input
                  id="confirmed-hybrid-bags"
                  label="Hybrid Bags *"
                  type="number"
                  value={availableBags}
                  readOnly
                  aria-label="Hybrid Bags (read-only)"
                  title="Confirmed Hybrid quantity matches total available stock"
                />
              </div>
            ) : (
              <>
                <div className={styles.fieldGroup}>
                  <Input
                    id="confirmed-small-bags"
                    label="Small Bags *"
                    type="number"
                    min={0}
                    step={1}
                    value={confirmedSmallBags}
                    onChange={(e) => setConfirmedSmallBags(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <Input
                    id="confirmed-big-bags"
                    label="Big Bags *"
                    type="number"
                    min={0}
                    step={1}
                    value={confirmedBigBags}
                    onChange={(e) => setConfirmedBigBags(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            <div className={styles.fieldGroup}>
              <Input
                id="confirmed-total-weight"
                label="Total Weight (kg, optional)"
                type="number"
                min={0.1}
                step={0.1}
                value={totalWeight}
                onChange={(e) => setTotalWeight(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>

            <div className={styles.fieldGroup}>
              <Select
                id="sorting-payment-mode"
                label="Payment Mode *"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </Select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <Input
              id="sorting-payment-notes"
              label="Payment / Sorting Notes (optional)"
              type="text"
              maxLength={250}
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="e.g. Verified by operator prior to rebagging"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
            <Button
              id="confirm-sort-btn"
              type="submit"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={submitting}
            >
              Confirm Details &amp; Generate Bill
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
