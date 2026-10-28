'use client';

import React, { useState } from 'react';
import type { BagType, Commodity, Grn, RepackGrnInput } from '@cold-storage/contracts';
import { Button, Input, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { computeHamaliCharge, validateRepackOperation } from './grnSorting.helper';
import styles from './GrnSortingModal.module.css';

interface GrnSortingStep2RepackProps {
  grn: Grn;
  commodity?: Commodity | null;
  submitting: boolean;
  onExecuteRepack: (input: RepackGrnInput) => Promise<void>;
  onBack: () => void;
}

export function GrnSortingStep2Repack({
  grn,
  commodity,
  submitting,
  onExecuteRepack,
  onBack,
}: GrnSortingStep2RepackProps) {
  const originalBags = grn.closingBags ?? grn.bags;
  const [resultingBagType, setResultingBagType] = useState<BagType>('S/B');
  const [repackedSmallBags, setRepackedSmallBags] = useState<string>(String(grn.smallBags || 0));
  const [repackedBigBags, setRepackedBigBags] = useState<string>(String(grn.bigBags || 0));
  const [repackedQuantity, setRepackedQuantity] = useState<string>(String(originalBags));
  const [referenceWeight, setReferenceWeight] = useState<string>(
    grn.totalBagsWeight != null ? String(grn.totalBagsWeight) : '',
  );
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isHybrid = resultingBagType === 'Hybrid';
  const totalRepacked = isHybrid
    ? Number(repackedQuantity) || 0
    : (Number(repackedSmallBags) || 0) + (Number(repackedBigBags) || 0);
  const variance = totalRepacked - originalBags;

  const hamaliRate = commodity?.isHamaliApplicable || (commodity?.hamaliRate ?? 0) > 0
    ? (commodity?.hamaliRate ?? 0)
    : 0;
  const hamaliCharge = computeHamaliCharge(totalRepacked, hamaliRate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const error = validateRepackOperation(
      {
        resultingBagType,
        repackedSmallBags: isHybrid ? null : Number(repackedSmallBags),
        repackedBigBags: isHybrid ? null : Number(repackedBigBags),
        repackedQuantity: isHybrid ? Number(repackedQuantity) : null,
        repackVarianceReason: varianceReason.trim() || undefined,
        remarks: remarks.trim(),
      },
      originalBags,
    );

    if (error) {
      setValidationError(error);
      return;
    }

    await onExecuteRepack({
      grnId: grn.id,
      resultingBagType,
      repackedSmallBags: isHybrid ? undefined : Number(repackedSmallBags),
      repackedBigBags: isHybrid ? undefined : Number(repackedBigBags),
      repackedQuantity: isHybrid ? Number(repackedQuantity) : undefined,
      referenceWeight: referenceWeight.trim() ? Number(referenceWeight) : undefined,
      repackVarianceReason: variance !== 0 ? varianceReason.trim() : undefined,
      remarks: remarks.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formCard}>
      {validationError && <Banner message={validationError} id="repack-validation-banner" />}

      <div className={styles.formCardTitle}>Step 2: Repacking / Rebagging Operation</div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
        Specify the resulting bag composition and any variance from physical rebagging.
      </p>

      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <Select
            id="resulting-bag-type"
            label="Resulting Bag Type *"
            value={resultingBagType}
            onChange={(e) => setResultingBagType(e.target.value as BagType)}
            required
          >
            <option value="S/B">S/B (Small / Big)</option>
            <option value="S">S (All Small)</option>
            <option value="B">B (All Big)</option>
            <option value="Hybrid">Hybrid</option>
          </Select>
        </div>

        {isHybrid ? (
          <div className={styles.fieldGroup}>
            <Input
              id="repack-quantity"
              label="Repacked Quantity *"
              type="number"
              min={1}
              step={1}
              value={repackedQuantity}
              onChange={(e) => setRepackedQuantity(e.target.value)}
              required
            />
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <Input
                id="repack-small-bags"
                label="Repacked Small Bags *"
                type="number"
                min={0}
                step={1}
                value={repackedSmallBags}
                onChange={(e) => setRepackedSmallBags(e.target.value)}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <Input
                id="repack-big-bags"
                label="Repacked Big Bags *"
                type="number"
                min={0}
                step={1}
                value={repackedBigBags}
                onChange={(e) => setRepackedBigBags(e.target.value)}
                required
              />
            </div>
          </>
        )}

        <div className={styles.fieldGroup}>
          <Input
            id="repack-reference-weight"
            label="Resulting Weight (kg, optional)"
            type="number"
            min={0.1}
            step={0.1}
            value={referenceWeight}
            onChange={(e) => setReferenceWeight(e.target.value)}
            placeholder="e.g. 4950"
          />
        </div>
      </div>

      {variance !== 0 && (
        <div className={styles.varianceWarning}>
          <strong>Repack Variance: {variance > 0 ? `+${variance}` : variance} bags</strong>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)' }}>
            Physical rebagging resulted in {totalRepacked} bags compared to original {originalBags} bags. Please state the operational reason.
          </p>
          <div style={{ marginTop: 'var(--space-1-5)' }}>
            <Input
              id="repack-variance-reason"
              label="Variance Reason *"
              type="text"
              maxLength={500}
              value={varianceReason}
              onChange={(e) => setVarianceReason(e.target.value)}
              placeholder="e.g. Damaged bags discarded / culled during sorting"
              required
            />
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <Input
          id="repack-remarks"
          label="Repacking Remarks *"
          type="text"
          maxLength={500}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Sorted, cleaned, and rebagged for cold storage"
          required
        />
      </div>

      <div className={styles.lotSummaryCard}>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Original Stock</span>
            <span className={styles.summaryValue}>{originalBags} bags</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Repacked Stock</span>
            <span className={styles.summaryValue}>{totalRepacked} bags</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Labor / Hamali Charge</span>
            <span className={styles.summaryValue}>₹{hamaliCharge.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
        <Button variant="outline" size="sm" onClick={onBack} disabled={submitting}>
          ← Back to Sorting Step
        </Button>
        <Button
          id="execute-repack-btn"
          type="submit"
          variant="primary"
          size="sm"
          isLoading={submitting}
          disabled={submitting}
        >
          Execute Repacking / Rebagging
        </Button>
      </div>
    </form>
  );
}
