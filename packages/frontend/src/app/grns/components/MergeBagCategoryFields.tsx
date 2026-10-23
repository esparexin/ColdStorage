'use client';

import React from 'react';
import {
  deriveHybridRateVisibility,
  isHybridBagCategory,
  type BagType,
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
  category: 'S/B', quantity: '', bagPrice: '', seasonalBagPrice: '',
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
 * Source bag-type confirmation for Internal Move, aligned with Outward Delivery SSOT.
 * Directly renders Small/Big composition inputs for standard lots (with auto-balancing
 * and quick-presets) or Quantity/Rate inputs for Hybrid lots.
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
}: MergeBagCategoryFieldsProps) {
  const smallRate = typeof rates?.small === 'number' && rates.small > 0 ? rates.small : 10;
  const bigRate = typeof rates?.big === 'number' && rates.big > 0 ? rates.big : 15;

  const isHybrid = value.category === 'Hybrid' || isHybridBagCategory(sourceBagType) || isHybridBagCategory(value.category);
  const visibility = deriveHybridRateVisibility({ rentType, inwardDate, deliveryDate: movementDate });

  const currentSmall = typeof value.smallBags === 'number' ? value.smallBags : '';
  const currentBig = typeof value.bigBags === 'number' ? value.bigBags : '';

  const handleSmallSplitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ smallBags: '', bigBags: '', confirmedSmallBags: '', confirmedBigBags: '' });
      return;
    }
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p >= 0) {
      const clamped = Math.min(totalMovedBags, p);
      const remaining = totalMovedBags - clamped;
      onChange({
        category: 'S/B', quantity: totalMovedBags,
        smallBags: clamped, bigBags: remaining,
        confirmedSmallBags: clamped, confirmedBigBags: remaining,
        seasonalBagPrice: smallRate, bagPrice: smallRate,
      });
    }
  };

  const handleBigSplitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onChange({ smallBags: '', bigBags: '', confirmedSmallBags: '', confirmedBigBags: '' });
      return;
    }
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p >= 0) {
      const clamped = Math.min(totalMovedBags, p);
      const remaining = totalMovedBags - clamped;
      onChange({
        category: 'S/B', quantity: totalMovedBags,
        bigBags: clamped, smallBags: remaining,
        confirmedBigBags: clamped, confirmedSmallBags: remaining,
        seasonalBagPrice: bigRate, bagPrice: bigRate,
      });
    }
  };

  const setAllSmall = () => {
    onChange({
      category: 'S/B', quantity: totalMovedBags,
      smallBags: totalMovedBags, bigBags: 0,
      confirmedSmallBags: totalMovedBags, confirmedBigBags: 0,
      seasonalBagPrice: smallRate, bagPrice: smallRate,
    });
  };

  const setAllBig = () => {
    onChange({
      category: 'S/B', quantity: totalMovedBags,
      smallBags: 0, bigBags: totalMovedBags,
      confirmedSmallBags: 0, confirmedBigBags: totalMovedBags,
      seasonalBagPrice: bigRate, bagPrice: bigRate,
    });
  };

  const handleHybridQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') { onChange({ quantity: '' }); return; }
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p >= 0) onChange({ quantity: Math.min(totalMovedBags, p) });
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

  if (isHybrid) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1-5)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
          <Input id="merge-hybrid-quantity" label="Hybrid Quantity (Bags)" type="number" min={1} max={totalMovedBags} value={value.quantity !== '' ? value.quantity : totalMovedBags} onChange={handleHybridQtyChange} disabled={submitting} required />
          {visibility.showSeasonalRate && (
            <Input id="merge-seasonal-rate" label="Seasonal Rate (₹/bag)" type="number" min={0} placeholder="0.00" value={value.seasonalBagPrice} onChange={handleSeasonalRateChange} disabled={submitting} required />
          )}
          {visibility.showMonthlyRate && (
            <Input id="merge-monthly-rate" label="Monthly Rate (₹/bag)" type="number" min={0} placeholder="0.00" value={value.monthlyBagPrice} onChange={handleMonthlyRateChange} disabled={submitting} required />
          )}
          {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
            <Input id="merge-bag-price" label="Each Bag Price (₹)" type="number" min={0} placeholder="0.00" value={value.bagPrice} onChange={handleFlatPriceChange} disabled={submitting} required />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
          Confirm Moved Bag Composition (Total: {totalMovedBags} Bags)
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <Button type="button" variant="outline" size="sm" onClick={setAllSmall} disabled={submitting}>
            All Small
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={setAllBig} disabled={submitting}>
            All Big
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        <Input
          id="merge-split-small"
          label={`Small Bags (₹${smallRate}/bag)`}
          type="number"
          min={0}
          max={totalMovedBags}
          value={currentSmall}
          onChange={handleSmallSplitChange}
          disabled={submitting}
          required
        />
        <Input
          id="merge-split-big"
          label={`Big Bags (₹${bigRate}/bag)`}
          type="number"
          min={0}
          max={totalMovedBags}
          value={currentBig}
          onChange={handleBigSplitChange}
          disabled={submitting}
          required
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        <Input
          id="merge-total-bags"
          label="Total Bags"
          type="number"
          readOnly
          aria-label="Total Bags (read-only)"
          value={totalMovedBags}
          disabled={submitting}
        />
        <Input
          id="merge-applicable-tariff"
          label="Applicable Tariff"
          type="text"
          readOnly
          aria-label="Applicable Tariff (read-only)"
          value={`₹${smallRate} (Small) / ₹${bigRate} (Big)`}
          disabled={submitting}
        />
      </div>
    </div>
  );
}
