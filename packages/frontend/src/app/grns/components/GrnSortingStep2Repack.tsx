'use client';

import React, { useState } from 'react';
import {
  toOperationalBagType,
  type Commodity,
  type Grn,
  type OperationalBagType,
  type RepackGrnInput,
} from '@cold-storage/contracts';
import { Button, Input, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { validateRepackOperation } from './grnSorting.helper';
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
  const [resultingBagType, setResultingBagType] = useState<OperationalBagType>(toOperationalBagType(grn.bagType));
  const [destinationChamber, setDestinationChamber] = useState<string>('');
  const [repackedSmallBags, setRepackedSmallBags] = useState<string>('');
  const [repackedBigBags, setRepackedBigBags] = useState<string>('');
  const [repackedQuantity, setRepackedQuantity] = useState<string>('');
  const [referenceWeight, setReferenceWeight] = useState<string>(grn.totalBagsWeight != null ? String(grn.totalBagsWeight) : '');
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const defaultLaborRate = (commodity?.isHamaliApplicable || (commodity?.hamaliRate ?? 0) > 0)
    ? (commodity?.hamaliRate ?? 0) : 0;
  const [laborRate, setLaborRate] = useState<string>(defaultLaborRate > 0 ? String(defaultLaborRate) : '');
  const [newBagsSupplied, setNewBagsSupplied] = useState<string>('');
  const [newBagRate, setNewBagRate] = useState<string>('');

  const isHybrid = resultingBagType === 'Hybrid';
  const totalRepacked = isHybrid
    ? Number(repackedQuantity) || 0
    : (Number(repackedSmallBags) || 0) + (Number(repackedBigBags) || 0);
  const variance = totalRepacked - originalBags;

  const parsedLaborRate = Number(laborRate) || 0;
  const sortingLaborCharge = parsedLaborRate > 0 ? totalRepacked * parsedLaborRate : 0;
  const parsedNewBags = Number(newBagsSupplied) || 0;
  const parsedBagRate = Number(newBagRate) || 0;
  const bardanaCharge = parsedNewBags * parsedBagRate;
  const totalServiceCharge = sortingLaborCharge + bardanaCharge;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const error = validateRepackOperation(
      {
        resultingBagType, destinationChamber: destinationChamber.trim(),
        repackedSmallBags: isHybrid ? null : (repackedSmallBags.trim() === '' ? null : Number(repackedSmallBags)),
        repackedBigBags: isHybrid ? null : (repackedBigBags.trim() === '' ? null : Number(repackedBigBags)),
        repackedQuantity: isHybrid ? (repackedQuantity.trim() === '' ? null : Number(repackedQuantity)) : null,
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
      grnId: grn.id, resultingBagType, destinationChamber: destinationChamber.trim(),
      repackedSmallBags: isHybrid ? undefined : Number(repackedSmallBags),
      repackedBigBags: isHybrid ? undefined : Number(repackedBigBags),
      repackedQuantity: isHybrid ? Number(repackedQuantity) : undefined,
      referenceWeight: referenceWeight.trim() ? Number(referenceWeight) : undefined,
      repackVarianceReason: variance !== 0 ? varianceReason.trim() : undefined,
      remarks: remarks.trim(),
      sortingLaborRatePerBag: parsedLaborRate > 0 ? parsedLaborRate : undefined,
      totalSortingLaborCharge: sortingLaborCharge > 0 ? sortingLaborCharge : undefined,
      newBagsSupplied: parsedNewBags > 0 ? parsedNewBags : undefined,
      newBagRate: parsedBagRate > 0 ? parsedBagRate : undefined,
      totalBardanaCharge: bardanaCharge > 0 ? bardanaCharge : undefined,
      totalServiceCharge: totalServiceCharge > 0 ? totalServiceCharge : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formCard}>
      {validationError && <Banner message={validationError} id="repack-validation-banner" />}

      <div className={styles.formCardTitle}>Step 2: Repacking &amp; Service Invoicing</div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
        Specify resulting bag composition, physical variance, and service labor/bardana supplies.
      </p>

      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <Select id="resulting-bag-type" label="Resulting Bag Type *" value={resultingBagType} onChange={(e) => setResultingBagType(e.target.value as OperationalBagType)} required>
            <option value="S/B">S/B (Small / Big)</option>
            <option value="Hybrid">Hybrid</option>
          </Select>
        </div>

        <div className={styles.fieldGroup}>
          <Input id="repack-destination-chamber" label="Destination Chamber *" type="text" required maxLength={20} value={destinationChamber} onChange={(e) => setDestinationChamber(e.target.value)} placeholder="e.g. A or CH-01" disabled={submitting} />
        </div>

        {isHybrid ? (
          <div className={styles.fieldGroup}>
            <Input id="repack-quantity" label="Repacked Quantity *" type="number" min={1} step={1} value={repackedQuantity} onChange={(e) => setRepackedQuantity(e.target.value)} required />
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <Input id="repack-small-bags" label="Repacked Small Bags *" type="number" min={0} step={1} value={repackedSmallBags} onChange={(e) => setRepackedSmallBags(e.target.value)} required />
            </div>
            <div className={styles.fieldGroup}>
              <Input id="repack-big-bags" label="Repacked Big Bags *" type="number" min={0} step={1} value={repackedBigBags} onChange={(e) => setRepackedBigBags(e.target.value)} required />
            </div>
          </>
        )}

        <div className={styles.fieldGroup}>
          <Input id="repack-reference-weight" label="Resulting Weight (kg, optional)" type="number" min={0.1} step={0.1} value={referenceWeight} onChange={(e) => setReferenceWeight(e.target.value)} placeholder="e.g. 4950" />
        </div>

        <div className={styles.fieldGroup}>
          <Input id="repack-labor-rate" label="Sorting Labor Rate (₹/bag)" type="number" min={0} step={0.5} value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder="e.g. 5" />
        </div>

        <div className={styles.fieldGroup}>
          <Input id="repack-new-bags" label="New Bags Supplied (Bardana)" type="number" min={0} step={1} value={newBagsSupplied} onChange={(e) => setNewBagsSupplied(e.target.value)} placeholder="0" />
        </div>

        {parsedNewBags > 0 && (
          <div className={styles.fieldGroup}>
            <Input id="repack-new-bag-rate" label="New Bag Cost (₹/bag) *" type="number" min={0.1} step={0.5} value={newBagRate} onChange={(e) => setNewBagRate(e.target.value)} placeholder="e.g. 40" required />
          </div>
        )}
      </div>

      {variance !== 0 && (
        <div className={styles.varianceWarning}>
          <strong>Repack Variance: {variance > 0 ? `+${variance}` : variance} bags</strong>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)' }}>
            Physical rebagging resulted in {totalRepacked} bags compared to original {originalBags} bags.
          </p>
          <div style={{ marginTop: 'var(--space-1-5)' }}>
            <Input id="repack-variance-reason" label="Variance Reason *" type="text" maxLength={500} value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} placeholder="e.g. Damaged bags culled during grading" required />
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <Input id="repack-remarks" label="Repacking Remarks *" type="text" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Sorted, graded and rebagged" required />
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
            <span className={styles.summaryLabel}>Labor Charge</span>
            <span className={styles.summaryValue}>₹{sortingLaborCharge.toFixed(2)}{parsedLaborRate > 0 ? ` (@ ₹${parsedLaborRate}/bag)` : ''}</span>
          </div>
          {bardanaCharge > 0 && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Bardana Cost</span>
              <span className={styles.summaryValue}>₹{bardanaCharge.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Service Invoice</span>
            <span className={styles.summaryValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'bold' }}>₹{totalServiceCharge.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
        <Button variant="outline" size="sm" onClick={onBack} disabled={submitting}>← Back to Sorting Step</Button>
        <Button id="execute-repack-btn" type="submit" variant="primary" size="sm" isLoading={submitting} disabled={submitting}>Execute Repack &amp; Generate Invoice</Button>
      </div>
    </form>
  );
}
