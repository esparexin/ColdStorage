'use client';

import React from 'react';
import { Input, Select } from '@/components/ui';
import { TransferBagConfirmationFields } from './TransferBagConfirmationFields';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  type BagType,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';
import styles from './InternalMovementModal.module.css';

interface Props {
  remainingBags: number;
  isUnverified: boolean;
  confirmedSmallBags: number | '';
  confirmedBigBags: number | '';
  onSmallChange: (v: number | '') => void;
  onBigChange: (v: number | '') => void;
  sourceBagCategory?: OutwardBagCategory | BagType;
  onCategoryChange?: (v: OutwardBagCategory) => void;
  sourceBagPrice: number | '';
  onPriceChange: (v: number | '') => void;
  sourceSeasonalBagPrice?: number | '';
  onSeasonalPriceChange?: (v: number | '') => void;
  sourceMonthlyBagPrice?: number | '';
  onMonthlyPriceChange?: (v: number | '') => void;
  rentType?: RentType;
  inwardDate?: Date | string;
  movementDate?: string;
  disabled?: boolean;
}

/** Ownership confirmation: Total Bags (read-only), Bag Category (Auto / S/B / Hybrid rates) */
export function TransferOwnershipConfirmation(p: Props) {
  const currentBagType = p.sourceBagCategory;
  const isHybrid = currentBagType === 'Hybrid' || isHybridBagCategory(currentBagType);
  const visibility = deriveHybridRateVisibility({
    rentType: p.rentType,
    inwardDate: p.inwardDate,
    deliveryDate: p.movementDate,
  });

  return (
    <>
      <Input
        id="transfer-total-bags"
        label="Total Bags"
        type="number"
        value={p.remainingBags}
        readOnly
        disabled={p.disabled}
        aria-label="Total Bags (read-only)"
        title="Authoritative remaining stock"
      />

      <Select
        id="transfer-bag-type-select"
        label="Bag Type"
        value={isHybrid ? 'Hybrid' : 'S/B'}
        onChange={(e) => {
          const val = e.target.value as OutwardBagCategory;
          p.onCategoryChange?.(val);
        }}
        disabled={p.disabled}
      >
        <option value="S/B">Small &amp; Big</option>
        <option value="Hybrid">Hybrid</option>
      </Select>

      {isHybrid ? (
        <div className={styles.formSection}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
            {visibility.showSeasonalRate && (
              <Input
                id="transfer-seasonal-rate"
                label="Seasonal Rate (₹/bag)"
                type="number"
                min={0}
                placeholder="0.00"
                value={p.sourceSeasonalBagPrice ?? ''}
                onChange={(e) => p.onSeasonalPriceChange?.(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
            {visibility.showMonthlyRate && (
              <Input
                id="transfer-monthly-rate"
                label="Monthly Rate (₹/bag)"
                type="number"
                min={0}
                placeholder="0.00"
                value={p.sourceMonthlyBagPrice ?? ''}
                onChange={(e) => p.onMonthlyPriceChange?.(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
            {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
              <Input
                id="transfer-bag-price"
                label="Each Bag Price (₹)"
                type="number"
                min={0}
                placeholder="0.00"
                value={p.sourceBagPrice}
                onChange={(e) => p.onPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
          </div>
          <div className={styles.noticeBox}>Rates are informational — rent follows source GRN rules and is recomputed at execution.</div>
        </div>
      ) : null}

      {!isHybrid && p.isUnverified ? (
        <TransferBagConfirmationFields
          remainingBags={p.remainingBags}
          confirmedSmallBags={p.confirmedSmallBags}
          confirmedBigBags={p.confirmedBigBags}
          onSmallChange={p.onSmallChange}
          onBigChange={p.onBigChange}
          disabled={p.disabled}
        />
      ) : null}
    </>
  );
}

