'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  toOperationalBagType,
  type Grn,
  type OperationalBagType,
  type SortGrnInput,
  type SortGrnResult,
} from '@cold-storage/contracts';
import { Button, Input, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { clampSortBagAllocation, validateSortConfirmation } from './grnSorting.helper';
import styles from './GrnSortingModal.module.css';

interface GrnSortingStep1ConfirmProps {
  grn: Grn;
  submitting: boolean;
  onConfirmAndBill: (input: SortGrnInput) => Promise<void>;
  sortingResult: SortGrnResult | null;
  onProceedToRepack: () => void;
}

export function GrnSortingStep1Confirm(props: GrnSortingStep1ConfirmProps) {
  const { grn, submitting, onConfirmAndBill, sortingResult, onProceedToRepack } = props;
  const availableBags = grn.closingBags ?? grn.bags;
  const isAlreadyVerified = grn.isCompositionVerified === true;
  const [confirmedBagType, setConfirmedBagType] = useState<OperationalBagType>(
    isAlreadyVerified ? toOperationalBagType(grn.bagType) : 'S/B',
  );
  const isHybrid = confirmedBagType === 'Hybrid';

  const hasMatchingComposition =
    isAlreadyVerified &&
    grn.smallBags != null && grn.bigBags != null && grn.smallBags + grn.bigBags === availableBags;

  const [confirmedSmallBags, setConfirmedSmallBags] = useState<string>(
    hasMatchingComposition ? String(grn.smallBags) : '',
  );
  const [confirmedBigBags, setConfirmedBigBags] = useState<string>(
    hasMatchingComposition ? String(grn.bigBags) : '',
  );
  const [totalWeight, setTotalWeight] = useState<string>(grn.totalBagsWeight != null ? String(grn.totalBagsWeight) : '');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleBagChange = (isSmall: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    const setter = isSmall ? setConfirmedSmallBags : setConfirmedBigBags;
    if (!val) return setter('');
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      const other = parseInt(isSmall ? confirmedBigBags : confirmedSmallBags, 10) || 0;
      setter(String(clampSortBagAllocation(parsed, other, availableBags)));
    }
  };

  const parsedSmall = isHybrid ? null : Number(confirmedSmallBags);
  const parsedBig = isHybrid ? null : Number(confirmedBigBags);
  const parsedBags = isHybrid ? availableBags : (parsedSmall ?? 0) + (parsedBig ?? 0);
  const parsedWeight = totalWeight.trim() ? Number(totalWeight) : null;

  const isSmallValid = isHybrid || (confirmedSmallBags !== '' && parsedSmall !== null && !isNaN(parsedSmall) && Number.isInteger(parsedSmall) && parsedSmall >= 0);
  const isBigValid = isHybrid || (confirmedBigBags !== '' && parsedBig !== null && !isNaN(parsedBig) && Number.isInteger(parsedBig) && parsedBig >= 0);
  const sumMatchesStock = isHybrid || parsedBags === availableBags;
  const isFormValid = isHybrid ? true : (isSmallValid && isBigValid && sumMatchesStock);

  const liveMismatchNotice =
    !isHybrid && confirmedSmallBags !== '' && confirmedBigBags !== '' && !sumMatchesStock
      ? `Sum of small (${parsedSmall ?? 0}) and big (${parsedBig ?? 0}) bags (${parsedBags}) must match available stock (${availableBags}).`
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const error = validateSortConfirmation(
      { confirmedBagType, confirmedBags: parsedBags, confirmedSmallBags: parsedSmall, confirmedBigBags: parsedBig, totalBagsWeight: parsedWeight },
      grn.bagType,
      availableBags,
      isAlreadyVerified,
    );
    if (error) {
      setValidationError(error);
      return;
    }

    await onConfirmAndBill({
      grnId: grn.id,
      confirmedBagType,
      confirmedBags: parsedBags,
      confirmedSmallBags: parsedSmall,
      confirmedBigBags: parsedBig,
      totalBagsWeight: parsedWeight,
      paymentMode: 'Cash',
      paymentNotes: paymentNotes.trim() || undefined,
    });
  };

  return (
    <div className={styles.modalContainer}>
      {(validationError || liveMismatchNotice) && (
        <Banner message={validationError || liveMismatchNotice!} id="sorting-validation-banner" />
      )}

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
              {isAlreadyVerified ? (
                <Input
                  id="confirmed-bag-type"
                  label="Confirm Bag Type *"
                  value={confirmedBagType === 'Hybrid' ? 'Hybrid' : 'S/B (Small / Big)'}
                  readOnly
                  aria-label="Confirm Bag Type (read-only)"
                  title="Existing bag type confirmed before repacking"
                />
              ) : (
                <Select
                  id="confirmed-bag-type-select"
                  label="Confirm Bag Type *"
                  value={confirmedBagType}
                  onChange={(e) => setConfirmedBagType(e.target.value as OperationalBagType)}
                >
                  <option value="S/B">S/B (Small / Big)</option>
                  <option value="Hybrid">Hybrid</option>
                </Select>
              )}
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
                    max={availableBags}
                    step={1}
                    value={confirmedSmallBags}
                    onChange={handleBagChange(true)}
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <Input
                    id="confirmed-big-bags"
                    label="Big Bags *"
                    type="number"
                    min={0}
                    max={availableBags}
                    step={1}
                    value={confirmedBigBags}
                    onChange={handleBagChange(false)}
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
          </div>

          <div className={styles.fieldGroup}>
            <Input
              id="sorting-payment-notes"
              label="Sorting Notes (optional)"
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
              disabled={submitting || !isFormValid}
            >
              Confirm Details &amp; Generate Bill
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
