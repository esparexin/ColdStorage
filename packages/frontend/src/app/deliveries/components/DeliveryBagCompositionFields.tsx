import React from 'react';
import {
  resolveOutwardRates,
  type BagType,
  type GrnInventorySummary,
  type RentSummaryDto,
  type RentType,
} from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import type { OutwardBagCategory } from '../hooks/deliveryRent.helper';
import { OutwardRentBreakdown } from './OutwardRentBreakdown';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  bagType: BagType;
  rentType: RentType;
  rentMonths?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  bagPrice?: number | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  monthlyRates?: { small: number; big: number } | null;
  withdrawal: GrnWithdrawal;
  bagCategory?: OutwardBagCategory;
  onBagCategoryChange?: (category: OutwardBagCategory) => void;
  onQuantityChange?: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  outwardRent: number;
  fieldErrors?: Record<string, string>;
  onPayRent?: (account: RentSummaryDto) => void;
  canPayRent?: boolean;
  rentSummary?: RentSummaryDto | null;
}

export function DeliveryBagCompositionFields({
  summary,
  rentType,
  rentMonths,
  smallBagPrice,
  bigBagPrice,
  bagPrice,
  inwardDate,
  deliveryDate,
  monthlyRates,
  withdrawal,
  onSmallBagsChange,
  onBigBagsChange,
  outwardRent,
  fieldErrors = {},
  rentSummary,
}: DeliveryBagCompositionFieldsProps) {
  const { bags: bagsError, smallBags: smallError, bigBags: bigError } = fieldErrors;
  const availableTotal = summary.availableSmallBags + summary.availableBigBags;
  const rates = resolveOutwardRates(rentType, { smallBagPrice, bigBagPrice, bagPrice });
  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const quantity = smallQty + bigQty;

  return (
    <>
      <div className={styles.compositionGrid}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-small-bags" className={pageStyles.fieldLabel}>
            Small Bags to Deliver
          </label>
          <input
            id="delivery-small-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={summary.availableSmallBags}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
            value={withdrawal.smallBags}
            aria-invalid={Boolean(bagsError || smallError)}
            aria-describedby={smallError ? 'delivery-small-error' : undefined}
            onChange={(e) => onSmallBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
          />
          <span className={styles.rateHint}>
            Available: {summary.availableSmallBags.toLocaleString('en-IN')} • Rate: ₹{rates.small}/bag
          </span>
          {smallError && (
            <span id="delivery-small-error" className={styles.fieldErrorText} role="alert">
              {smallError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-big-bags" className={pageStyles.fieldLabel}>
            Big Bags to Deliver
          </label>
          <input
            id="delivery-big-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={summary.availableBigBags}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
            value={withdrawal.bigBags}
            aria-invalid={Boolean(bagsError || bigError)}
            aria-describedby={bigError ? 'delivery-big-error' : undefined}
            onChange={(e) => onBigBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')}
          />
          <span className={styles.rateHint}>
            Available: {summary.availableBigBags.toLocaleString('en-IN')} • Rate: ₹{rates.big}/bag
          </span>
          {bigError && (
            <span id="delivery-big-error" className={styles.fieldErrorText} role="alert">
              {bigError}
            </span>
          )}
        </div>
      </div>

      {bagsError && !smallError && !bigError && (
        <span id="delivery-bags-error" className={styles.fieldErrorText} role="alert">
          {bagsError}
        </span>
      )}

      <div className={styles.totalDeliveringRow}>
        <span>Total Delivering Quantity:</span>
        <span className={styles.totalHighlight}>
          {quantity.toLocaleString('en-IN')} of {availableTotal.toLocaleString('en-IN')} bags
        </span>
      </div>

      <OutwardRentBreakdown
        rentType={rentType}
        inwardDate={inwardDate}
        deliveryDate={deliveryDate || new Date().toISOString().split('T')[0]}
        smallBags={smallQty}
        bigBags={bigQty}
        seasonalRates={rates}
        monthlyRates={monthlyRates ?? rates}
        rentMonths={rentMonths}
        totalRent={outwardRent}
        pendingBalance={rentSummary?.remainingBalance}
      />
    </>
  );
}
