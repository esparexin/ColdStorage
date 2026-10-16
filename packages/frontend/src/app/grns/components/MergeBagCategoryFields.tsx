'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';
import { Input, Select } from '@/components/ui';

export interface BagConfirmationValue {
  category: OutwardBagCategory;
  quantity: number | '';
  bagPrice: number | '';
  seasonalBagPrice: number | '';
  monthlyBagPrice: number | '';
}

export const DEFAULT_BAG_CONFIRMATION: BagConfirmationValue = {
  category: 'S/B',
  quantity: '',
  bagPrice: '',
  seasonalBagPrice: '',
  monthlyBagPrice: '',
};

interface MergeBagCategoryFieldsProps {
  value: BagConfirmationValue;
  onChange: (patch: Partial<BagConfirmationValue>) => void;
  totalMovedBags: number;
  // Source-driven rate visibility (outward semantics for the confirmed lot),
  // falling back to the target context when no source is selected yet.
  rentType: RentType;
  inwardDate: Date | string;
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
  value, onChange, totalMovedBags, rentType, inwardDate, movementDate,
  repackMode, onRepackModeChange, repackSmall, onRepackSmallChange,
  repackBig, onRepackBigChange, referenceWeight, onReferenceWeightChange,
  hasUnconfirmedMix, submitting,
}: MergeBagCategoryFieldsProps) {
  const isHybrid = isHybridBagCategory(value.category);
  const visibility = deriveHybridRateVisibility({
    rentType, inwardDate, deliveryDate: movementDate,
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
        value={value.category}
        onChange={(e) => {
          const cat = e.target.value as OutwardBagCategory;
          onChange({
            category: cat,
            ...(isHybridBagCategory(cat) ? { quantity: totalMovedBags } : {}),
          });
        }}
        disabled={submitting}
      >
        <option value="S/B">S/B — confirm split below (0 allowed per side)</option>
        <option value="Hybrid">Hybrid — quantity + per-bag rate</option>
      </Select>

      {(value.category === 'S/B' || value.category === 'Small & Big') && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', cursor: 'pointer', marginTop: '4px' }}>
            <input
              type="checkbox"
              id="repack-mode-checkbox"
              checked={repackMode}
              onChange={(e) => {
                onRepackModeChange(e.target.checked);
                if (!e.target.checked && !hasUnconfirmedMix) {
                  onRepackSmallChange('');
                  onRepackBigChange('');
                  onReferenceWeightChange('');
                }
              }}
              disabled={submitting}
            />
            <span>Physical Repacking / Rebagging (Applies Hamali handling charge)</span>
          </label>

          {(hasUnconfirmedMix || repackMode) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              {hasUnconfirmedMix && (
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-text)' }}>
                  Confirm Bag Mix for Unverified Lot
                </span>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <Input id="repack-small" type="number" min={0} max={totalMovedBags} placeholder={repackMode ? "Repacked Small Bags" : "Small Bags"} aria-label={repackMode ? "Repacked small bags" : "Small bags"} value={repackSmall} onChange={(e) => onRepackSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
                <Input id="repack-big" type="number" min={0} max={totalMovedBags} placeholder={repackMode ? "Repacked Big Bags" : "Big Bags"} aria-label={repackMode ? "Repacked big bags" : "Big bags"} value={repackBig} onChange={(e) => onRepackBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0' }}>
                <span>{repackMode ? 'Repacked Total:' : 'Final Total:'} <strong>{repackedSum}</strong> / {totalMovedBags} bags</span>
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
          <Input
            id="merge-hybrid-quantity"
            type="number"
            readOnly
            placeholder="Total Bags"
            aria-label="Total Bags (read-only)"
            title="Total bags automatically calculated from selected source GRNs"
            value={totalMovedBags > 0 ? totalMovedBags : ''}
            disabled={submitting}
          />
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
        </div>
      )}
    </div>
  );
}
