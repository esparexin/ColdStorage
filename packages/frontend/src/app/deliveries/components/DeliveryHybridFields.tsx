import React from 'react';
import type { GrnInventorySummary } from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

export interface DeliveryHybridFieldsProps {
  summary: GrnInventorySummary;
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
  onQuantityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showSeasonalRate?: boolean;
  showMonthlyRate?: boolean;
  seasonalBagPrice?: number | '';
  monthlyBagPrice?: number | '';
  manualBagPrice?: number | '';
  onRateInput: (fn?: (v: number | '') => void) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeasonalBagPriceChange?: (value: number | '') => void;
  onMonthlyBagPriceChange?: (value: number | '') => void;
  onManualBagPriceChange?: (value: number | '') => void;
  fieldErrors: Record<string, string>;
  remainingStock: number;
}

export function DeliveryHybridFields({
  summary,
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
  onQuantityChange,
  showSeasonalRate,
  showMonthlyRate,
  seasonalBagPrice,
  monthlyBagPrice,
  manualBagPrice,
  onRateInput,
  onSeasonalBagPriceChange,
  onMonthlyBagPriceChange,
  onManualBagPriceChange,
  fieldErrors,
  remainingStock,
}: DeliveryHybridFieldsProps) {
  return (
    <>
      <div className={styles.compositionGrid}>
        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="delivery-hybrid-small-bags" className={styles.labelTitle}>
              Small Bags
            </label>
            <span className={styles.rateText}>Avail: {summary.availableSmallBags}</span>
          </div>
          <input
            id="delivery-hybrid-small-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxAllowedSmall}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
            value={withdrawal.smallBags}
            aria-invalid={Boolean(bagsError || smallError)}
            aria-describedby={smallError ? 'delivery-hybrid-small-error' : undefined}
            onChange={onSmallChange}
            disabled={maxAllowedSmall === 0 && availableTotal > 0 && !isCombinedPool}
          />
          {smallError && (
            <span id="delivery-hybrid-small-error" className={styles.fieldErrorText} role="alert">
              {smallError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="delivery-hybrid-big-bags" className={styles.labelTitle}>
              Big Bags
            </label>
            <span className={styles.rateText}>Avail: {summary.availableBigBags}</span>
          </div>
          <input
            id="delivery-hybrid-big-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxAllowedBig}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
            value={withdrawal.bigBags}
            aria-invalid={Boolean(bagsError || bigError)}
            aria-describedby={bigError ? 'delivery-hybrid-big-error' : undefined}
            onChange={onBigChange}
            disabled={maxAllowedBig === 0 && availableTotal > 0 && !isCombinedPool}
          />
          {bigError && (
            <span id="delivery-hybrid-big-error" className={styles.fieldErrorText} role="alert">
              {bigError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <label htmlFor="delivery-hybrid-quantity-bags" className={styles.labelTitle}>
              Hybrid Bags
            </label>
            <span className={styles.rateText}>Total: {availableTotal}</span>
          </div>
          <input
            id="delivery-hybrid-quantity-bags"
            type="number"
            inputMode="numeric"
            min={1}
            max={availableTotal}
            placeholder="0"
            className={`${pageStyles.fieldInput} ${bagsError ? styles.inputError : ''}`}
            value={withdrawal.quantity ?? ''}
            aria-invalid={Boolean(bagsError)}
            aria-describedby={bagsError ? 'delivery-hybrid-quantity-error' : undefined}
            onChange={onQuantityChange}
          />
          {bagsError && (
            <span id="delivery-hybrid-quantity-error" className={styles.fieldErrorText} role="alert">
              {bagsError}
            </span>
          )}
        </div>
      </div>

      <div className={styles.hybridGrid3}>
        {showSeasonalRate && (
          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-seasonal-rate" className={styles.labelTitle}>
                Seasonal Rate (₹/bag)
              </label>
            </div>
            <input
              id="delivery-seasonal-rate"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              className={`${pageStyles.fieldInput} ${fieldErrors.seasonalBagPrice ? styles.inputError : ''}`}
              value={seasonalBagPrice ?? ''}
              aria-invalid={Boolean(fieldErrors.seasonalBagPrice)}
              aria-describedby={fieldErrors.seasonalBagPrice ? 'delivery-seasonal-rate-error' : undefined}
              onChange={onRateInput(onSeasonalBagPriceChange)}
            />
            {fieldErrors.seasonalBagPrice && (
              <span id="delivery-seasonal-rate-error" className={styles.fieldErrorText} role="alert">
                {fieldErrors.seasonalBagPrice}
              </span>
            )}
          </div>
        )}

        {showMonthlyRate && (
          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-monthly-rate" className={styles.labelTitle}>
                Monthly Rate (₹/bag)
              </label>
            </div>
            <input
              id="delivery-monthly-rate"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              className={`${pageStyles.fieldInput} ${fieldErrors.monthlyBagPrice ? styles.inputError : ''}`}
              value={monthlyBagPrice ?? ''}
              aria-invalid={Boolean(fieldErrors.monthlyBagPrice)}
              aria-describedby={fieldErrors.monthlyBagPrice ? 'delivery-monthly-rate-error' : undefined}
              onChange={onRateInput(onMonthlyBagPriceChange)}
            />
            {fieldErrors.monthlyBagPrice && (
              <span id="delivery-monthly-rate-error" className={styles.fieldErrorText} role="alert">
                {fieldErrors.monthlyBagPrice}
              </span>
            )}
          </div>
        )}

        {!showSeasonalRate && !showMonthlyRate && (
          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-bag-price" className={styles.labelTitle}>
                Each Bag Price (₹)
              </label>
            </div>
            <input
              id="delivery-bag-price"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              className={`${pageStyles.fieldInput} ${fieldErrors.bagPrice ? styles.inputError : ''}`}
              value={manualBagPrice ?? ''}
              aria-invalid={Boolean(fieldErrors.bagPrice)}
              aria-describedby={fieldErrors.bagPrice ? 'delivery-bag-price-error' : undefined}
              onChange={onRateInput(onManualBagPriceChange)}
            />
            {fieldErrors.bagPrice && (
              <span id="delivery-bag-price-error" className={styles.fieldErrorText} role="alert">
                {fieldErrors.bagPrice}
              </span>
            )}
          </div>
        )}

        <div className={pageStyles.fieldGroup}>
          <div className={styles.labelRow}>
            <span className={styles.labelTitle}>Bal. Bags</span>
          </div>
          <div className={styles.balanceDisplay} id="delivery-balance-bags-display">
            <span className={styles.balanceText}>
              {remainingStock.toLocaleString('en-IN')} / {availableTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
