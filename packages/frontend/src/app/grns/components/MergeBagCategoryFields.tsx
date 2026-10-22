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
  smallBags?: number | '';
  bigBags?: number | '';
  confirmedSmallBags?: number | '';
  confirmedBigBags?: number | '';
}

export const DEFAULT_BAG_CONFIRMATION: BagConfirmationValue = {
  category: 'Hybrid', quantity: '', bagPrice: '', seasonalBagPrice: '',
  monthlyBagPrice: '', smallBags: '', bigBags: '',
};

interface MergeBagCategoryFieldsProps {
  value: BagConfirmationValue;
  onChange: (patch: Partial<BagConfirmationValue>) => void;
  totalMovedBags: number;
  rentType: RentType;
  inwardDate: Date | string;
  movementDate: string;
  submitting: boolean;
  rates?: { small: number; big: number };
  rawSmall?: number;
  rawBig?: number;
}

/**
 * Source bag-type confirmation for Internal Move, aligned with Outward Delivery
 * and Transfer Ownership SSOT. Rates and bag counts confirm stored lot composition
 * and drive the Outward Rent Calculation breakdown.
 */
export function MergeBagCategoryFields({
  value,
  onChange,
  totalMovedBags,
  rentType,
  inwardDate,
  movementDate,
  submitting,
  rates,
  rawSmall,
  rawBig,
}: MergeBagCategoryFieldsProps) {
  const isHybrid = isHybridBagCategory(value.category);
  const visibility = deriveHybridRateVisibility({
    rentType,
    inwardDate,
    deliveryDate: movementDate,
  });

  const confirmedSmall = typeof value.smallBags === 'number' ? value.smallBags : (rawSmall ?? 0);
  const confirmedBig = typeof value.bigBags === 'number' ? value.bigBags : (rawBig ?? 0);
  const confirmedTotal = confirmedSmall + confirmedBig;
  const isMatched = confirmedTotal === totalMovedBags;

  const setNum =
    (key: keyof BagConfirmationValue, int: boolean) =>
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
          if (isHybridBagCategory(cat)) {
            onChange({ category: cat, quantity: totalMovedBags });
          } else {
            onChange({
              category: cat,
              smallBags: typeof value.smallBags === 'number' ? value.smallBags : (rawSmall ?? totalMovedBags),
              bigBags: typeof value.bigBags === 'number' ? value.bigBags : (rawBig ?? 0),
            });
          }
        }}
        disabled={submitting}
      >
        <option value="S/B">S/B</option>
        <option value="Hybrid">Hybrid</option>
      </Select>

      {!isHybrid ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: '4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label htmlFor="merge-small-bags" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                  Small Bags
                </label>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {rentType === 'Monthly' ? 'Monthly: ' : 'Rate: '}₹{rates?.small ?? 10}/bag
                </span>
              </div>
              <Input
                id="merge-small-bags"
                type="number"
                min={0}
                max={totalMovedBags}
                placeholder="0"
                value={value.smallBags !== undefined ? value.smallBags : (rawSmall ?? 0)}
                onChange={setNum('smallBags', true)}
                disabled={submitting}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label htmlFor="merge-big-bags" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                  Big Bags
                </label>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {rentType === 'Monthly' ? 'Monthly: ' : 'Rate: '}₹{rates?.big ?? 15}/bag
                </span>
              </div>
              <Input
                id="merge-big-bags"
                type="number"
                min={0}
                max={totalMovedBags}
                placeholder="0"
                value={value.bigBags !== undefined ? value.bigBags : (rawBig ?? 0)}
                onChange={setNum('bigBags', true)}
                disabled={submitting}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                Total Confirmed
              </label>
              <div
                style={{
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 var(--space-3)',
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  color: isMatched ? 'var(--color-text-primary)' : 'var(--color-warning-text)',
                }}
              >
                {confirmedTotal} / {totalMovedBags} bags
              </div>
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Confirmed Small and Big counts and rates are applied directly to outward rent calculation.
          </div>
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
