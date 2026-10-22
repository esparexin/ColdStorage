'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';
import { Button, Input } from '@/components/ui';

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
}: MergeBagCategoryFieldsProps) {
  const smallRate = typeof rates?.small === 'number' && rates.small > 0 ? rates.small : 110;
  const bigRate = typeof rates?.big === 'number' && rates.big > 0 ? rates.big : 185;

  const hasConfirmedSmall =
    (typeof value.smallBags === 'number' && value.smallBags > 0 && (value.bigBags === 0 || value.bigBags === '')) ||
    value.category === 'Small' ||
    (value.seasonalBagPrice === smallRate && typeof value.smallBags === 'number');
  const hasConfirmedBig =
    (typeof value.bigBags === 'number' && value.bigBags > 0 && (value.smallBags === 0 || value.smallBags === '')) ||
    value.category === 'Big' ||
    (value.seasonalBagPrice === bigRate && typeof value.bigBags === 'number');
  const selectedType: 'Small' | 'Big' | null = hasConfirmedBig ? 'Big' : (hasConfirmedSmall ? 'Small' : null);

  const visibility = deriveHybridRateVisibility({
    rentType,
    inwardDate,
    deliveryDate: movementDate,
  });

  const handleSelectType = (type: 'Small' | 'Big') => {
    if (type === 'Small') {
      onChange({
        category: 'S/B',
        quantity: totalMovedBags,
        smallBags: totalMovedBags,
        bigBags: 0,
        confirmedSmallBags: totalMovedBags,
        confirmedBigBags: 0,
        seasonalBagPrice: smallRate,
        bagPrice: smallRate,
      });
    } else {
      onChange({
        category: 'S/B',
        quantity: totalMovedBags,
        smallBags: 0,
        bigBags: totalMovedBags,
        confirmedSmallBags: 0,
        confirmedBigBags: totalMovedBags,
        seasonalBagPrice: bigRate,
        bagPrice: bigRate,
      });
    }
  };

  const handleMonthlyRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ monthlyBagPrice: '' });
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChange({ monthlyBagPrice: parsed });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1-5)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
          Bag Type
        </label>
        <div
          role="radiogroup"
          aria-label="Bag Type"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}
        >
          <Button
            type="button"
            role="radio"
            aria-checked={selectedType === 'Small'}
            variant={selectedType === 'Small' ? 'primary' : 'outline'}
            onClick={() => handleSelectType('Small')}
            disabled={submitting}
          >
            Small Bags — ₹{smallRate}/bag
          </Button>
          <Button
            type="button"
            role="radio"
            aria-checked={selectedType === 'Big'}
            variant={selectedType === 'Big' ? 'primary' : 'outline'}
            onClick={() => handleSelectType('Big')}
            disabled={submitting}
          >
            Big Bags — ₹{bigRate}/bag
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
        <Input
          id="merge-total-bags"
          label="Total Bags"
          type="number"
          readOnly
          aria-label="Total Bags (read-only)"
          title="Configured Total Bags from selected source GRNs"
          value={totalMovedBags > 0 ? totalMovedBags : ''}
          disabled={submitting}
        />
        <Input
          id="merge-seasonal-rate"
          label="Seasonal Rate (₹/bag)"
          type="number"
          readOnly
          aria-label="Seasonal Rate (read-only)"
          placeholder={selectedType === null ? 'Select bag type' : undefined}
          value={selectedType === 'Small' ? smallRate : (selectedType === 'Big' ? bigRate : '')}
          disabled={submitting}
        />
        {visibility.showMonthlyRate && (
          <Input
            id="merge-monthly-rate"
            label="Monthly Rate (₹/bag)"
            type="number"
            min={0}
            placeholder="0.00"
            value={value.monthlyBagPrice}
            onChange={handleMonthlyRateChange}
            disabled={submitting}
          />
        )}
      </div>
    </div>
  );
}
