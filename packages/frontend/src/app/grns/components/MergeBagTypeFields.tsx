'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  type BagType,
  type RentType,
} from '@cold-storage/contracts';
import { Input, Select } from '@/components/ui';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import styles from './MergeBagTypeFields.module.css';

interface MergeBagTypeFieldsProps {
  value: BagConfirmationValue;
  onChange: (patch: Partial<BagConfirmationValue>) => void;
  totalMovedBags: number;
  rentType: RentType;
  inwardDate: Date | string;
  movementDate: string;
  submitting: boolean;
  rates: { small: number; big: number };
  sourceBagType?: BagType;
  disabled?: boolean;
}

export function MergeBagTypeFields({
  value,
  onChange,
  totalMovedBags,
  rentType,
  inwardDate,
  movementDate,
  submitting,
  rates,
  sourceBagType,
  disabled = false,
}: MergeBagTypeFieldsProps) {
  const isHybrid = value.category === 'Hybrid' || isHybridBagCategory(sourceBagType) || isHybridBagCategory(value.category);
  const visibility = deriveHybridRateVisibility({ rentType, inwardDate, deliveryDate: movementDate });

  const smallRate = typeof rates?.small === 'number' && rates.small > 0 ? rates.small : 10;
  const bigRate = typeof rates?.big === 'number' && rates.big > 0 ? rates.big : 15;

  const smallQty = typeof value.smallBags === 'number' ? value.smallBags : 0;
  const bigQty = typeof value.bigBags === 'number' ? value.bigBags : 0;
  const remainingStock = Math.max(0, totalMovedBags - (smallQty + bigQty));

  const maxAllowedSmall = Math.max(0, totalMovedBags - bigQty);
  const maxAllowedBig = Math.max(0, totalMovedBags - smallQty);

  const handleBagTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const isNextHybrid = e.target.value === 'Hybrid';
    onChange({
      category: isNextHybrid ? 'Hybrid' : 'S/B',
      quantity: totalMovedBags,
      smallBags: totalMovedBags,
      bigBags: 0,
      confirmedSmallBags: totalMovedBags,
      confirmedBigBags: 0,
      seasonalBagPrice: isNextHybrid ? value.seasonalBagPrice : smallRate,
      bagPrice: isNextHybrid ? value.bagPrice : smallRate,
    });
  };

  const handleSplitChange = (side: 'small' | 'big') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (!raw) {
      if (side === 'small') onChange({ smallBags: '', confirmedSmallBags: '' });
      else onChange({ bigBags: '', confirmedBigBags: '' });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      const allowed = side === 'small' ? maxAllowedSmall : maxAllowedBig;
      const clamped = Math.min(parsed, allowed);
      if (side === 'small') {
        onChange({ category: 'S/B', quantity: totalMovedBags, smallBags: clamped, confirmedSmallBags: clamped, seasonalBagPrice: smallRate, bagPrice: smallRate });
      } else {
        onChange({ category: 'S/B', quantity: totalMovedBags, bigBags: clamped, confirmedBigBags: clamped, seasonalBagPrice: bigRate, bagPrice: bigRate });
      }
    }
  };

  const handlePriceInput = (field: 'seasonalBagPrice' | 'monthlyBagPrice' | 'bagPrice') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (!raw) { onChange({ [field]: '' }); return; }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0) {
      if (field === 'seasonalBagPrice') onChange({ seasonalBagPrice: parsed, bagPrice: parsed });
      else onChange({ [field]: parsed });
    }
  };

  const isDisabled = submitting || disabled;

  if (isHybrid) {
    const isMultiRate = visibility.showSeasonalRate && visibility.showMonthlyRate;
    return (
      <div className={isMultiRate ? styles.rowLayout5 : styles.rowLayout4}>
        <Select id="merge-bag-type-hybrid-select" label="Bag Type" value="Hybrid" onChange={handleBagTypeChange} disabled={isDisabled}>
          <option value="S/B">S/B (Small &amp; Big)</option>
          <option value="Hybrid">Hybrid</option>
        </Select>

        <Input
          id="merge-hybrid-quantity-bags"
          label="Hybrid Bags"
          rightAction={<span className={styles.rateText}>Total: {totalMovedBags}</span>}
          type="number"
          value={totalMovedBags}
          readOnly
          aria-label="Hybrid Bags (read-only)"
          disabled={isDisabled}
        />

        {visibility.showSeasonalRate && (
          <Input
            id="merge-seasonal-rate"
            label="Seasonal Rate"
            rightAction={<span className={styles.rateText}>₹/bag</span>}
            type="number"
            min={0}
            placeholder="0.00"
            value={value.seasonalBagPrice}
            onChange={handlePriceInput('seasonalBagPrice')}
            disabled={isDisabled}
            required
          />
        )}

        {visibility.showMonthlyRate && (
          <Input
            id="merge-monthly-rate"
            label="Monthly Rate"
            rightAction={<span className={styles.rateText}>₹/bag</span>}
            type="number"
            min={0}
            placeholder="0.00"
            value={value.monthlyBagPrice}
            onChange={handlePriceInput('monthlyBagPrice')}
            disabled={isDisabled}
            required
          />
        )}

        {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
          <Input
            id="merge-bag-price"
            label="Each Bag Price"
            rightAction={<span className={styles.rateText}>₹/bag</span>}
            type="number"
            min={0}
            placeholder="0.00"
            value={value.bagPrice}
            onChange={handlePriceInput('bagPrice')}
            disabled={isDisabled}
            required
          />
        )}

        <div className={styles.fieldCol}>
          <div className={styles.labelRow}>
            <span className={styles.labelTitle}>Bal. Bags</span>
          </div>
          <div className={styles.balanceDisplay} id="merge-balance-hybrid-display">
            <span className={styles.balanceText}>0 / {totalMovedBags}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rowLayout4}>
      <Select id="merge-bag-type-sb-select" label="Bag Type" value="S/B" onChange={handleBagTypeChange} disabled={isDisabled}>
        <option value="S/B">S/B (Small &amp; Big)</option>
        <option value="Hybrid">Hybrid</option>
      </Select>

      <Input
        id="merge-small-bags"
        label="Small Bags"
        rightAction={<span className={styles.rateText}>₹{smallRate}/bag</span>}
        type="number"
        min={0}
        max={maxAllowedSmall}
        placeholder="0"
        value={value.smallBags !== '' && value.smallBags !== undefined ? value.smallBags : ''}
        onChange={handleSplitChange('small')}
        disabled={isDisabled}
        required
      />

      <Input
        id="merge-big-bags"
        label="Big Bags"
        rightAction={<span className={styles.rateText}>₹{bigRate}/bag</span>}
        type="number"
        min={0}
        max={maxAllowedBig}
        placeholder="0"
        value={value.bigBags !== '' && value.bigBags !== undefined ? value.bigBags : ''}
        onChange={handleSplitChange('big')}
        disabled={isDisabled}
        required
      />

      <div className={styles.fieldCol}>
        <div className={styles.labelRow}>
          <span className={styles.labelTitle}>Bal. Bags</span>
        </div>
        <div className={styles.balanceDisplay} id="merge-balance-sb-display">
          <span className={styles.balanceText}>
            {remainingStock} / {totalMovedBags}
          </span>
        </div>
      </div>
    </div>
  );
}
