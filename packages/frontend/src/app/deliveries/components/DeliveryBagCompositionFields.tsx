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
import {
  calculateRemainingStock,
  clampBagAllocation,
} from '../hooks/eligibleGrn.helper';
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
  bagType,
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
  const isSbLot = bagType === 'S+B' || bagType === 'S/B';
  const isSegregated = summary.availableSmallBags > 0 && summary.availableBigBags > 0;
  const isCombinedPool = isSbLot && !isSegregated;

  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const remainingStock = calculateRemainingStock(availableTotal, smallQty, bigQty);

  const maxAllowedSmall = isCombinedPool
    ? Math.max(0, availableTotal - bigQty)
    : Math.min(summary.availableSmallBags, Math.max(0, availableTotal - bigQty));

  const maxAllowedBig = isCombinedPool
    ? Math.max(0, availableTotal - smallQty)
    : Math.min(summary.availableBigBags, Math.max(0, availableTotal - smallQty));

  const rates = resolveOutwardRates(rentType, { smallBagPrice, bigBagPrice, bagPrice });

  const handleSmallChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      onSmallBagsChange('');
      return;
    }
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 0) return;
    const clamped = clampBagAllocation(
      parsed,
      bigQty,
      availableTotal,
      isCombinedPool ? undefined : summary.availableSmallBags,
    );
    onSmallBagsChange(clamped);
  };

  const handleBigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      onBigBagsChange('');
      return;
    }
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 0) return;
    const clamped = clampBagAllocation(
      parsed,
      smallQty,
      availableTotal,
      isCombinedPool ? undefined : summary.availableBigBags,
    );
    onBigBagsChange(clamped);
  };

  const handleKeyDown =
    (currentVal: number, maxAllowed: number) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp' && currentVal >= maxAllowed) {
        e.preventDefault();
      }
    };

  return (
    <>
      <div className={styles.compositionGrid}>
        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="delivery-small-bags" className={styles.labelTitle}>
              Small Bags
            </label>
            <span className={styles.rateText}>Rate: ₹{rates.small}/bag</span>
          </div>
          <input
            id="delivery-small-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxAllowedSmall}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
            value={withdrawal.smallBags}
            aria-invalid={Boolean(bagsError || smallError)}
            aria-describedby={smallError ? 'delivery-small-error' : undefined}
            onChange={handleSmallChange}
            onKeyDown={handleKeyDown(smallQty, maxAllowedSmall)}
          />
          {smallError && (
            <span id="delivery-small-error" className={styles.fieldErrorText} role="alert">
              {smallError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="delivery-big-bags" className={styles.labelTitle}>
              Big Bags
            </label>
            <span className={styles.rateText}>Rate: ₹{rates.big}/bag</span>
          </div>
          <input
            id="delivery-big-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxAllowedBig}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
            value={withdrawal.bigBags}
            aria-invalid={Boolean(bagsError || bigError)}
            aria-describedby={bigError ? 'delivery-big-error' : undefined}
            onChange={handleBigChange}
            onKeyDown={handleKeyDown(bigQty, maxAllowedBig)}
          />
          {bigError && (
            <span id="delivery-big-error" className={styles.fieldErrorText} role="alert">
              {bigError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <span className={styles.labelTitle}>bal.Bag</span>
          </div>
          <div className={styles.balanceDisplay} id="delivery-balance-bags-display">
            <span className={styles.balanceText}>
              {remainingStock.toLocaleString('en-IN')} bags remaining
            </span>
          </div>
        </div>
      </div>

      {bagsError && !smallError && !bigError && (
        <span id="delivery-bags-error" className={styles.fieldErrorText} role="alert">
          {bagsError}
        </span>
      )}

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
