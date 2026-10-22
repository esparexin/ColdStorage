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
  rentType: RentType;
  inwardDate: Date | string;
  movementDate: string;
  submitting: boolean;
}

/**
 * Source bag-type confirmation for Internal Move, aligned with Outward Delivery
 * and Transfer Ownership SSOT. Rates shown and captured here are informational:
 * rent is recomputed from source GRN rules at execution.
 */
export function MergeBagCategoryFields({
  value,
  onChange,
  totalMovedBags,
  rentType,
  inwardDate,
  movementDate,
  submitting,
}: MergeBagCategoryFieldsProps) {
  const isHybrid = isHybridBagCategory(value.category);
  const visibility = deriveHybridRateVisibility({
    rentType,
    inwardDate,
    deliveryDate: movementDate,
  });

  const setNum =
    (key: 'quantity' | 'bagPrice' | 'seasonalBagPrice' | 'monthlyBagPrice', int: boolean) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '') {
        onChange({ [key]: '' } as Partial<BagConfirmationValue>);
        return;
      }
      const parsed = int ? parseInt(raw, 10) : parseFloat(raw);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        onChange({ [key]: parsed } as Partial<BagConfirmationValue>);
      }
    };

  return (
    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
      <Select
        id="merge-bag-type-select"
        label="Bag Type"
        value={isHybrid ? 'Hybrid' : 'S/B'}
        onChange={(e) => {
          const cat = e.target.value as OutwardBagCategory;
          onChange({
            category: cat,
            ...(isHybridBagCategory(cat) ? { quantity: totalMovedBags } : {}),
          });
        }}
        disabled={submitting}
      >
        <option value="S/B">S/B</option>
        <option value="Hybrid">Hybrid</option>
      </Select>

      {!isHybrid ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Source bags move with their standard composition. Any physical re-bagging/repacking can be configured in Step 4.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: '4px' }}>
          <Input
            id="merge-total-bags"
            label="Total Bags"
            type="number"
            readOnly
            aria-label="Total Bags (read-only)"
            title="Total bags automatically calculated from selected source GRNs"
            value={totalMovedBags > 0 ? totalMovedBags : ''}
            disabled={submitting}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
            {visibility.showSeasonalRate && (
              <Input
                id="merge-seasonal-rate"
                label="Seasonal Rate (₹/bag)"
                type="number"
                min={0}
                placeholder="0.00"
                value={value.seasonalBagPrice}
                onChange={setNum('seasonalBagPrice', false)}
                disabled={submitting}
              />
            )}
            {visibility.showMonthlyRate && (
              <Input
                id="merge-monthly-rate"
                label="Monthly Rate (₹/bag)"
                type="number"
                min={0}
                placeholder="0.00"
                value={value.monthlyBagPrice}
                onChange={setNum('monthlyBagPrice', false)}
                disabled={submitting}
              />
            )}
            {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
              <Input
                id="merge-bag-price"
                label="Each Bag Price (₹)"
                type="number"
                min={0}
                placeholder="0.00"
                value={value.bagPrice}
                onChange={setNum('bagPrice', false)}
                disabled={submitting}
              />
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Rates are informational — rent follows source GRN rules and is recomputed at execution.
          </div>
        </div>
      )}
    </div>
  );
}
