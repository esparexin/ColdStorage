import React from 'react';
import type { GrnInventorySummary, RentType } from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

export interface DeliveryStandardSbFieldsProps {
  summary: GrnInventorySummary;
  rentType: RentType;
  rates: { small: number; big: number };
  availableTotal: number;
  maxAllowedSmall: number;
  maxAllowedBig: number;
  isCombinedPool: boolean;
  withdrawal: GrnWithdrawal;
  bagsError?: string;
  smallError?: string;
  bigError?: string;
  onSmallChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  remainingStock: number;
}

export function DeliveryStandardSbFields({
  summary,
  rentType,
  rates,
  availableTotal,
  maxAllowedSmall,
  maxAllowedBig,
  isCombinedPool,
  withdrawal,
  bagsError,
  smallError,
  bigError,
  onSmallChange,
  onBigChange,
  remainingStock,
}: DeliveryStandardSbFieldsProps) {
  return (
    <div className={styles.compositionGrid}>
      <div className={pageStyles.fieldGroup}>
        <div className={styles.labelRow}>
          <label htmlFor="delivery-small-bags" className={styles.labelTitle}>
            Small Bags
          </label>
          <span className={styles.rateText}>
            {rentType === 'Monthly' ? 'Monthly Rate: ' : 'Rate: '}₹{rates.small}/bag
            {rentType === 'Monthly' ? '/mo' : ''} (Avail: {summary.availableSmallBags})
          </span>
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
          onChange={onSmallChange}
          disabled={maxAllowedSmall === 0 && availableTotal > 0 && !isCombinedPool}
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
          <span className={styles.rateText}>
            {rentType === 'Monthly' ? 'Monthly Rate: ' : 'Rate: '}₹{rates.big}/bag
            {rentType === 'Monthly' ? '/mo' : ''} (Avail: {summary.availableBigBags})
          </span>
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
          onChange={onBigChange}
          disabled={maxAllowedBig === 0 && availableTotal > 0 && !isCombinedPool}
        />
        {bigError && (
          <span id="delivery-big-error" className={styles.fieldErrorText} role="alert">
            {bigError}
          </span>
        )}
      </div>

      <div className={pageStyles.fieldGroup}>
        <div className={styles.labelRow}>
          <span className={styles.labelTitle}>Bal. Bags</span>
        </div>
        <div className={styles.balanceDisplay} id="delivery-balance-sb-display">
          <span className={styles.balanceText}>
            {remainingStock.toLocaleString('en-IN')} / {availableTotal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}
