'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  resolveOutwardRates,
  type Grn,
  type OutwardBagCategory,
} from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface BagConfirmationValue {
  category: OutwardBagCategory;
  quantity: number | '';
  bagPrice: number | '';
  seasonalBagPrice: number | '';
  monthlyBagPrice: number | '';
}

export const DEFAULT_BAG_CONFIRMATION: BagConfirmationValue = {
  category: 'Small & Big',
  quantity: '',
  bagPrice: '',
  seasonalBagPrice: '',
  monthlyBagPrice: '',
};

interface MergeBagCategoryFieldsProps {
  value: BagConfirmationValue;
  onChange: (patch: Partial<BagConfirmationValue>) => void;
  totalMovedBags: number;
  targetGrn: Grn;
  movementDate: string;
  repackMode: boolean;
  onRepackModeChange: (v: boolean) => void;
  repackSmall: number | '';
  onRepackSmallChange: (v: number | '') => void;
  repackBig: number | '';
  onRepackBigChange: (v: number | '') => void;
  referenceWeight: number | '';
  onReferenceWeightChange: (v: number | '') => void;
  hasUnconfirmedMix: boolean;
  submitting: boolean;
}

/**
 * Source bag-category confirmation for Internal Move, modeled 1:1 on the
 * outward bag-type experience (SelectedGrnCard selector +
 * DeliveryBagCompositionFields branches). Rates shown and captured here are
 * informational: rent is recomputed from source GRN rules at execution.
 */
export function MergeBagCategoryFields({
  value, onChange, totalMovedBags, targetGrn, movementDate,
  repackMode, onRepackModeChange, repackSmall, onRepackSmallChange,
  repackBig, onRepackBigChange, referenceWeight, onReferenceWeightChange,
  hasUnconfirmedMix, submitting,
}: MergeBagCategoryFieldsProps) {
  const isHybrid = isHybridBagCategory(value.category);
  const rates = resolveOutwardRates(targetGrn.rentType, {
    smallBagPrice: targetGrn.smallBagPrice, bigBagPrice: targetGrn.bigBagPrice, bagPrice: targetGrn.bagPrice,
  });
  const visibility = deriveHybridRateVisibility({
    rentType: targetGrn.rentType, inwardDate: targetGrn.date, deliveryDate: movementDate,
  });
  const repackedSum = (typeof repackSmall === 'number' ? repackSmall : 0) + (typeof repackBig === 'number' ? repackBig : 0);
  const isRepackFilled = typeof repackSmall === 'number' && typeof repackBig === 'number';

  const setNum = (key: 'quantity' | 'bagPrice' | 'seasonalBagPrice' | 'monthlyBagPrice', int: boolean) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '') { onChange({ [key]: '' } as Partial<BagConfirmationValue>); return; }
      const parsed = int ? parseInt(raw, 10) : parseFloat(raw);
      if (!Number.isNaN(parsed) && parsed >= 0) onChange({ [key]: parsed } as Partial<BagConfirmationValue>);
    };

  return (
    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
      <Select
        id="merge-bag-category" label="Confirmed Bag Category"
        value={value.category} onChange={(e) => onChange({ category: e.target.value as OutwardBagCategory })}
        disabled={submitting}
      >
        <option value="Small">Small — all bags as Small</option>
        <option value="Big">Big — all bags as Big</option>
        <option value="Small & Big">Small & Big — confirm split below</option>
        <option value="Hybrid">Hybrid / Mixed — quantity + per-bag rate</option>
      </Select>

      {(value.category === 'Small' || value.category === 'Big') && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Confirmed:</span>
          <span className={styles.detailValue}>
            All {totalMovedBags} bags as {value.category} <Badge variant="neutral">Rate: ₹{value.category === 'Small' ? rates.small : rates.big}/bag</Badge>
          </span>
        </div>
      )}

      {value.category === 'Small & Big' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', cursor: 'pointer', marginTop: '4px' }}>
            <input type="checkbox" checked={repackMode || hasUnconfirmedMix} onChange={(e) => { onRepackModeChange(e.target.checked); if (!e.target.checked && !hasUnconfirmedMix) { onRepackSmallChange(''); onRepackBigChange(''); onReferenceWeightChange(''); } }} disabled={submitting || hasUnconfirmedMix} />
            <span>{hasUnconfirmedMix ? 'Bag Mix Confirmation Required (Unverified Lot)' : 'Confirm Repacked Bag Mix & Reference Weight'}</span>
          </label>
          {(repackMode || hasUnconfirmedMix) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <Input id="repack-small" type="number" min={0} max={totalMovedBags} placeholder="Small Bags" aria-label="Repacked small bags" value={repackSmall} onChange={(e) => onRepackSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
                <Input id="repack-big" type="number" min={0} max={totalMovedBags} placeholder="Big Bags" aria-label="Repacked big bags" value={repackBig} onChange={(e) => onRepackBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0' }}>
                <span>Final Total: <strong>{repackedSum}</strong> / {totalMovedBags} bags</span>
                {isRepackFilled && repackedSum === totalMovedBags ? (
                  <span style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-semibold)' }}>✓ Counts Reconciled</span>
                ) : (
                  <span style={{ color: 'var(--color-danger-text)', fontWeight: 'var(--font-semibold)' }}>
                    {repackedSum > totalMovedBags ? `Exceeds by ${repackedSum - totalMovedBags}` : `Pending ${totalMovedBags - repackedSum}`}
                  </span>
                )}
              </div>
              <Input id="reference-weight" type="number" min={0} placeholder="Total Reference Weight (kg) — Optional reference" aria-label="Total reference weight in kilograms (optional)" value={referenceWeight} onChange={(e) => onReferenceWeightChange(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
            </div>
          )}
        </>
      )}

      {isHybrid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          <Input id="merge-hybrid-quantity" type="number" min={0} max={totalMovedBags} placeholder="Hybrid Bags" aria-label="Confirmed Hybrid quantity" value={value.quantity} onChange={setNum('quantity', true)} disabled={submitting} />
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {visibility.showSeasonalRate && (
              <Input id="merge-seasonal-rate" type="number" min={0} placeholder="Seasonal Rate (₹/bag)" aria-label="Seasonal per-bag rate" value={value.seasonalBagPrice} onChange={setNum('seasonalBagPrice', false)} disabled={submitting} />
            )}
            {visibility.showMonthlyRate && (
              <Input id="merge-monthly-rate" type="number" min={0} placeholder="Monthly Rate (₹/bag)" aria-label="Monthly per-bag rate" value={value.monthlyBagPrice} onChange={setNum('monthlyBagPrice', false)} disabled={submitting} />
            )}
            {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
              <Input id="merge-bag-price" type="number" min={0} placeholder="Each Bag Price (₹)" aria-label="Manual per-bag price" value={value.bagPrice} onChange={setNum('bagPrice', false)} disabled={submitting} />
            )}
          </div>
          <div className={styles.noticeBox}>Rates are informational — rent follows source GRN rules and is recomputed at execution.</div>
        </div>
      )}
    </div>
  );
}
