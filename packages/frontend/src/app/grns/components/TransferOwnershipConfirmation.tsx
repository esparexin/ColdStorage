'use client';

import React from 'react';
import { Input, Select } from '@/components/ui';
import { TransferBagConfirmationFields } from './TransferBagConfirmationFields';
import type { OutwardBagCategory } from '@cold-storage/contracts';
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
  sourceQuantity: number | '';
  onQuantityChange: (v: number | '') => void;
  sourceBagPrice: number | '';
  onPriceChange: (v: number | '') => void;
  disabled?: boolean;
}

/** Ownership confirmation parity with merge: S/B split or Hybrid qty+rate (M3). */
export function TransferOwnershipConfirmation(p: Props) {
  return (
    <>
      <Select
        id="transfer-bag-category"
        label="Bag Category"
        value={p.sourceBagCategory}
        onChange={(e) => p.onCategoryChange(e.target.value as OutwardBagCategory | '')}
        disabled={p.disabled}
      >
        <option value="">-- Auto (ledger) --</option>
        <option value="S/B">S/B (ledger split)</option>
        <option value="Hybrid">Hybrid (manual rate)</option>
      </Select>
      {p.sourceBagCategory === 'Hybrid' || p.sourceBagCategory === 'Mixed' ? (
        <div className={styles.formSection}>
          <label htmlFor="transfer-hybrid-qty" className={styles.inputLabel}>Hybrid Quantity *</label>
          <Input id="transfer-hybrid-qty" type="text" inputMode="numeric" required
            value={p.sourceQuantity} onChange={(e) => p.onQuantityChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={`e.g. ${p.remainingBags}`} disabled={p.disabled} />
          <label htmlFor="transfer-hybrid-rate" className={styles.inputLabel}>Per-Bag Rate (₹) *</label>
          <Input id="transfer-hybrid-rate" type="text" inputMode="decimal" required
            value={p.sourceBagPrice} onChange={(e) => p.onPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 12" disabled={p.disabled} />
        </div>
      ) : null}
      {p.isUnverified && p.sourceBagCategory !== 'Hybrid' && p.sourceBagCategory !== 'Mixed' ? (
        <TransferBagConfirmationFields
          remainingBags={p.remainingBags} confirmedSmallBags={p.confirmedSmallBags}
          confirmedBigBags={p.confirmedBigBags} onSmallChange={p.onSmallChange}
          onBigChange={p.onBigChange} disabled={p.disabled} />
      ) : null}
    </>
  );
}
