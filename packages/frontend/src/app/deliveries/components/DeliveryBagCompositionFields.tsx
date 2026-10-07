import React from 'react';
import {
  CANONICAL_BAG_RATES,
  type BagType,
  type GrnInventorySummary,
  type RentType,
} from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import type { GrnWithdrawal } from '../types';
import { formatOutwardRentFormula, type OutwardBagCategory } from '../hooks/deliveryRent.helper';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  bagType: BagType;
  rentType: RentType;
  rentMonths?: number | null;
  withdrawal: GrnWithdrawal;
  bagCategory: OutwardBagCategory;
  onBagCategoryChange: (category: OutwardBagCategory) => void;
  onQuantityChange: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  outwardRent: number;
  fieldErrors?: Record<string, string>;
}

const BAG_TYPE_LABEL: Record<BagType, string> = {
  S: 'S — Small',
  B: 'B — Big',
  'S+B': 'S+B',
  'S/B': 'S/B',
};

export function DeliveryBagCompositionFields({
  summary,
  bagType,
  rentType,
  rentMonths,
  withdrawal,
  bagCategory,
  onBagCategoryChange,
  onQuantityChange,
  onSmallBagsChange,
  onBigBagsChange,
  outwardRent,
  fieldErrors = {},
}: DeliveryBagCompositionFieldsProps) {
  const { bags: bagsError, smallBags: smallError, bigBags: bigError } = fieldErrors;
  const availableTotal = summary.availableSmallBags + summary.availableBigBags;
  const rates = CANONICAL_BAG_RATES[rentType] ?? { small: 10, big: 15 };
  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const quantity = smallQty + bigQty;

  return (
    <>
      <div className={styles.stockTableWrapper}>
        <table className={styles.stockTable}>
          <caption className={styles.stockCaption}>Current stock from the selected Inward GRN</caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Available</th>
              <th style={{ textAlign: 'left' }}>S/B Category</th>
              <th style={{ textAlign: 'left' }}>Chamber</th>
              <th style={{ textAlign: 'left' }}>Rent Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                {availableTotal.toLocaleString('en-IN')} bags
              </td>
              <td style={{ textAlign: 'left' }}>{BAG_TYPE_LABEL[bagType] ?? 'S/B'}</td>
              <td style={{ textAlign: 'left' }}>{summary.chamber}</td>
              <td style={{ textAlign: 'left', fontWeight: 'var(--font-medium)' }}>{rentType} (Fixed)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.categorySection}>
        <label className={pageStyles.fieldLabel} id="category-selector-label">Outward Bag Category *</label>
        <div className={styles.categorySelector} role="radiogroup" aria-labelledby="category-selector-label">
          {(['Small', 'Big', 'Small & Big'] as const).map((cat) => (
            <Button
              key={cat}
              type="button"
              role="radio"
              size="sm"
              aria-checked={bagCategory === cat}
              variant={bagCategory === cat ? 'primary' : 'outline'}
              className={styles.categoryButton}
              onClick={() => onBagCategoryChange(cat)}
            >
              {cat} ({cat === 'Small' ? `₹${rates.small}` : cat === 'Big' ? `₹${rates.big}` : `₹${rates.small}/₹${rates.big}`})
            </Button>
          ))}
        </div>
      </div>

      {bagCategory === 'Small' && (
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-single-small-bags" className={pageStyles.fieldLabel}>Small Bags to Deliver *</label>
          <input
            id="delivery-single-small-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={availableTotal}
            placeholder="Small bags to deliver"
            className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
            value={withdrawal.smallBags !== '' ? withdrawal.smallBags : ''}
            aria-invalid={Boolean(bagsError || smallError)}
            aria-describedby={bagsError || smallError ? 'delivery-single-small-error' : undefined}
            onChange={(e) => onQuantityChange(e.target.value ? parseInt(e.target.value, 10) : '')}
          />
          <span className={styles.rateHint}>Rate: ₹{rates.small}/bag ({rentType})</span>
          {(bagsError || smallError) && (
            <span id="delivery-single-small-error" className={styles.fieldErrorText} role="alert">{bagsError ?? smallError}</span>
          )}
        </div>
      )}

      {bagCategory === 'Big' && (
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-single-big-bags" className={pageStyles.fieldLabel}>Big Bags to Deliver *</label>
          <input
            id="delivery-single-big-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={availableTotal}
            placeholder="Big bags to deliver"
            className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
            value={withdrawal.bigBags !== '' ? withdrawal.bigBags : ''}
            aria-invalid={Boolean(bagsError || bigError)}
            aria-describedby={bagsError || bigError ? 'delivery-single-big-error' : undefined}
            onChange={(e) => onQuantityChange(e.target.value ? parseInt(e.target.value, 10) : '')}
          />
          <span className={styles.rateHint}>Rate: ₹{rates.big}/bag ({rentType})</span>
          {(bagsError || bigError) && (
            <span id="delivery-single-big-error" className={styles.fieldErrorText} role="alert">{bagsError ?? bigError}</span>
          )}
        </div>
      )}

      {bagCategory === 'Small & Big' && (
        <div className={pageStyles.formGrid2}>
          <div className={pageStyles.fieldGroup}>
            <label htmlFor="delivery-split-small-bags" className={pageStyles.fieldLabel}>Small Bags to Deliver *</label>
            <input
              id="delivery-split-small-bags"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Small bags"
              className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
              value={withdrawal.smallBags}
              aria-invalid={Boolean(bagsError || smallError)}
              aria-describedby={smallError ? 'delivery-split-small-error' : undefined}
              onChange={(e) => onSmallBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
            />
            <span className={styles.rateHint}>Rate: ₹{rates.small}/bag</span>
            {smallError && <span id="delivery-split-small-error" className={styles.fieldErrorText} role="alert">{smallError}</span>}
          </div>
          <div className={pageStyles.fieldGroup}>
            <label htmlFor="delivery-split-big-bags" className={pageStyles.fieldLabel}>Big Bags to Deliver *</label>
            <input
              id="delivery-split-big-bags"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Big bags"
              className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
              value={withdrawal.bigBags}
              aria-invalid={Boolean(bagsError || bigError)}
              aria-describedby={bigError ? 'delivery-split-big-error' : undefined}
              onChange={(e) => onBigBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
            />
            <span className={styles.rateHint}>Rate: ₹{rates.big}/bag</span>
            {bigError && <span id="delivery-split-big-error" className={styles.fieldErrorText} role="alert">{bigError}</span>}
          </div>
        </div>
      )}

      {bagsError && bagCategory === 'Small & Big' && !smallError && !bigError && (
        <span id="delivery-split-bags-error" className={styles.fieldErrorText} role="alert">{bagsError}</span>
      )}

      <div className={styles.outwardRentCard}>
        <div className={styles.outwardRentHeader}>
          <span className={styles.outwardRentTitle}>Calculated Outward Rent</span>
          <span className={styles.outwardRentTypeBadge}>{rentType}</span>
        </div>
        <div className={styles.outwardRentAmount}>₹{outwardRent.toLocaleString('en-IN')}</div>
        <div className={styles.outwardRentFormula}>
          {formatOutwardRentFormula(rentType, bagCategory, smallQty, bigQty, rates.small, rates.big, rentMonths)}
        </div>
      </div>

      <div className={pageStyles.totalDelivering}>
        Total Delivering: <span style={{ color: 'var(--color-primary)' }}>{quantity}</span> bags
      </div>
    </>
  );
}
