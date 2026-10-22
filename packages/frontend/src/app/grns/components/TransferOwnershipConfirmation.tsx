'use client';

import React from 'react';
import { Input, Select } from '@/components/ui';
import { TransferBagConfirmationFields } from './TransferBagConfirmationFields';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
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
  sourceBagCategory: OutwardBagCategory | '';
  onCategoryChange: (v: OutwardBagCategory | '') => void;
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
  const isHybrid = isHybridBagCategory(p.sourceBagCategory);
  const visibility = deriveHybridRateVisibility({
    rentType: p.rentType,
    inwardDate: p.inwardDate,
    deliveryDate: p.movementDate,
  });

  return (
    <>
      <div className={styles.formSection}>
        <label htmlFor="transfer-total-bags" className={styles.inputLabel}>
          Total Bags
        </label>
        <Input
          id="transfer-total-bags"
          type="number"
          value={p.remainingBags}
          readOnly
          disabled={p.disabled}
          aria-label="Total Bags (read-only)"
          title="Authoritative remaining stock"
        />
      </div>

      <Select
        id="transfer-bag-category"
        label="Bag Category"
        value={p.sourceBagCategory}
        onChange={(e) => p.onCategoryChange(e.target.value as OutwardBagCategory | '')}
        disabled={p.disabled}
      >
        <option value="">-- Default (As Inwarded) --</option>
        <option value="S/B">Small & Big Split</option>
        <option value="Hybrid">Flat Rate (Single Price)</option>
      </Select>

      {isHybrid ? (
        <div className={styles.formSection}>
          <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: '4px' }}>
            {visibility.showSeasonalRate && (
              <Input
                id="transfer-seasonal-rate"
                type="number"
                min={0}
                placeholder="Seasonal Rate (₹/bag)"
                aria-label="Seasonal per-bag rate"
                value={p.sourceSeasonalBagPrice ?? ''}
                onChange={(e) => p.onSeasonalPriceChange?.(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
            {visibility.showMonthlyRate && (
              <Input
                id="transfer-monthly-rate"
                type="number"
                min={0}
                placeholder="Monthly Rate (₹/bag)"
                aria-label="Monthly per-bag rate"
                value={p.sourceMonthlyBagPrice ?? ''}
                onChange={(e) => p.onMonthlyPriceChange?.(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
            {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
              <Input
                id="transfer-hybrid-rate"
                type="number"
                min={0}
                placeholder="Per-Bag Rate (₹)"
                aria-label="Per-bag rate"
                value={p.sourceBagPrice}
                onChange={(e) => p.onPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={p.disabled}
              />
            )}
          </div>
          <div className={styles.noticeBox}>Rates are informational — rent follows source GRN rules and is recomputed at execution.</div>
        </div>
      ) : null}

      {p.isUnverified && p.sourceBagCategory === 'S/B' ? (
        <TransferBagConfirmationFields
          remainingBags={p.remainingBags} confirmedSmallBags={p.confirmedSmallBags}
          confirmedBigBags={p.confirmedBigBags} onSmallChange={p.onSmallChange}
          onBigChange={p.onBigChange} disabled={p.disabled} />
      ) : null}

      {p.isUnverified && !p.sourceBagCategory ? (
        <div className={styles.noticeBox} style={{ color: 'var(--color-warning-text)' }}>
          Bag composition is unsegregated. Confirm Small &amp; Big counts or specify rate to settle dues.
        </div>
      ) : null}
    </>
  );
}

