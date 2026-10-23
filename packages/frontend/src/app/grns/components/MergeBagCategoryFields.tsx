'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  type BagType,
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
  sourceBagType?: BagType;
  isCompositionVerified?: boolean | null;
  rawSmall?: number;
  rawBig?: number;
}

/**
 * Source bag-type confirmation for Internal Move, aligned with Outward Delivery
 * and Transfer Ownership SSOT. Dropdown selection drives composition and the
 * multi-year Outward Rent Calculation breakdown.
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
  sourceBagType,
  isCompositionVerified,
  rawSmall,
  rawBig,
}: MergeBagCategoryFieldsProps) {
  const smallRate = typeof rates?.small === 'number' && rates.small > 0 ? rates.small : 10;
  const bigRate = typeof rates?.big === 'number' && rates.big > 0 ? rates.big : 15;

  const isHybrid = value.category === 'Hybrid' || isHybridBagCategory(value.category);
  const isAllSmall = !isHybrid && value.smallBags === totalMovedBags && (value.bigBags === 0 || value.bigBags === '');
  const isAllBig = !isHybrid && value.bigBags === totalMovedBags && (value.smallBags === 0 || value.smallBags === '');
  const selectedDropdownValue = isHybrid ? 'Hybrid' : (isAllBig ? 'Big' : (isAllSmall ? 'Small' : 'S/B'));

  const visibility = deriveHybridRateVisibility({ rentType, inwardDate, deliveryDate: movementDate });
  const isSourceHybrid = sourceBagType === 'Hybrid' || isHybridBagCategory(sourceBagType);
  const isSourceSmallOnly = Boolean(isCompositionVerified && (sourceBagType === 'S' || (rawSmall === totalMovedBags && rawBig === 0)));
  const isSourceBigOnly = Boolean(isCompositionVerified && (sourceBagType === 'B' || (rawBig === totalMovedBags && rawSmall === 0)));

  const seasonalRateDisplay = isHybrid
    ? (value.seasonalBagPrice || value.bagPrice || '')
    : selectedDropdownValue === 'Small'
      ? smallRate
      : selectedDropdownValue === 'Big'
        ? bigRate
        : smallRate === bigRate ? smallRate : `${smallRate} (S) / ${bigRate} (B)`;

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === 'Small') {
      onChange({
        category: 'S/B', quantity: totalMovedBags, smallBags: totalMovedBags, bigBags: 0,
        confirmedSmallBags: totalMovedBags, confirmedBigBags: 0, seasonalBagPrice: smallRate, bagPrice: smallRate,
      });
    } else if (next === 'Big') {
      onChange({
        category: 'S/B', quantity: totalMovedBags, smallBags: 0, bigBags: totalMovedBags,
        confirmedSmallBags: 0, confirmedBigBags: totalMovedBags, seasonalBagPrice: bigRate, bagPrice: bigRate,
      });
    } else if (next === 'Hybrid') {
      onChange({
        category: 'Hybrid', quantity: totalMovedBags, smallBags: totalMovedBags, bigBags: 0,
        confirmedSmallBags: totalMovedBags, confirmedBigBags: 0,
        seasonalBagPrice: value.seasonalBagPrice || smallRate, bagPrice: value.bagPrice || smallRate,
      });
    } else {
      const s = typeof rawSmall === 'number' && rawSmall > 0 ? rawSmall : Math.floor(totalMovedBags / 2);
      onChange({
        category: 'S/B', quantity: totalMovedBags, smallBags: s, bigBags: totalMovedBags - s,
        confirmedSmallBags: s, confirmedBigBags: totalMovedBags - s, seasonalBagPrice: smallRate, bagPrice: smallRate,
      });
    }
  };

  const handleSmallSplitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ smallBags: '', bigBags: '', confirmedSmallBags: '', confirmedBigBags: '' }); return; }
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p >= 0) {
      const clamped = Math.min(totalMovedBags, p);
      onChange({ smallBags: clamped, bigBags: totalMovedBags - clamped, confirmedSmallBags: clamped, confirmedBigBags: totalMovedBags - clamped });
    }
  };

  const handleBigSplitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ smallBags: '', bigBags: '', confirmedSmallBags: '', confirmedBigBags: '' }); return; }
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p >= 0) {
      const clamped = Math.min(totalMovedBags, p);
      onChange({ bigBags: clamped, smallBags: totalMovedBags - clamped, confirmedBigBags: clamped, confirmedSmallBags: totalMovedBags - clamped });
    }
  };

  const handleMonthlyRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ monthlyBagPrice: '' }); return; }
    const p = parseFloat(raw);
    if (!Number.isNaN(p) && p >= 0) onChange({ monthlyBagPrice: p });
  };

  const handleSeasonalRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ seasonalBagPrice: '' }); return; }
    const p = parseFloat(raw);
    if (!Number.isNaN(p) && p >= 0) onChange({ seasonalBagPrice: p, bagPrice: p });
  };

  const handleFlatPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ bagPrice: '' }); return; }
    const p = parseFloat(raw);
    if (!Number.isNaN(p) && p >= 0) onChange({ bagPrice: p });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1-5)' }}>
      <Select id="merge-bag-type-select" label="Bag Type" value={selectedDropdownValue} onChange={handleDropdownChange} disabled={submitting}>
        {isSourceHybrid ? (
          <option value="Hybrid">Hybrid</option>
        ) : (
          <>
            {!isSourceSmallOnly && !isSourceBigOnly && <option value="S/B">Small &amp; Big</option>}
            {!isSourceBigOnly && <option value="Small">Small Bags — ₹{smallRate}/bag</option>}
            {!isSourceSmallOnly && <option value="Big">Big Bags — ₹{bigRate}/bag</option>}
            <option value="Hybrid">Hybrid</option>
          </>
        )}
      </Select>

      {selectedDropdownValue === 'S/B' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          <Input id="merge-split-small" label={`Small Bags (₹${smallRate}/bag)`} type="number" min={0} max={totalMovedBags} value={value.smallBags} onChange={handleSmallSplitChange} disabled={submitting} required />
          <Input id="merge-split-big" label={`Big Bags (₹${bigRate}/bag)`} type="number" min={0} max={totalMovedBags} value={value.bigBags} onChange={handleBigSplitChange} disabled={submitting} required />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
        <Input id="merge-total-bags" label="Total Bags" type="number" readOnly aria-label="Total Bags (read-only)" title="Configured Total Bags from selected source GRNs" value={totalMovedBags > 0 ? totalMovedBags : ''} disabled={submitting} />
        <Input
          id="merge-seasonal-rate"
          label="Seasonal Rate (₹/bag)"
          type={selectedDropdownValue === 'S/B' && smallRate !== bigRate ? 'text' : 'number'}
          readOnly={!isHybrid || !visibility.showSeasonalRate}
          aria-label="Seasonal Rate"
          value={seasonalRateDisplay}
          onChange={isHybrid && visibility.showSeasonalRate ? handleSeasonalRateChange : undefined}
          disabled={submitting}
        />
        {visibility.showMonthlyRate && (
          <Input id="merge-monthly-rate" label="Monthly Rate (₹/bag)" type="number" min={0} placeholder="0.00" value={value.monthlyBagPrice} onChange={handleMonthlyRateChange} disabled={submitting} />
        )}
        {isHybrid && !visibility.showSeasonalRate && !visibility.showMonthlyRate && (
          <Input id="merge-bag-price" label="Each Bag Price (₹)" type="number" min={0} placeholder="0.00" value={value.bagPrice} onChange={handleFlatPriceChange} disabled={submitting} />
        )}
      </div>
    </div>
  );
}
