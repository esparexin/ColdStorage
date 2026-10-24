import React from 'react';
import type { GrnWithdrawal } from '../types';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

export interface DeliveryHybridFieldsProps {
  availableTotal: number;
  withdrawal: GrnWithdrawal;
  bagsError?: string;
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
  availableTotal,
  withdrawal,
  bagsError,
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
  const gridClass = showSeasonalRate && showMonthlyRate ? styles.hybridGrid4 : styles.hybridGrid3;

  return (
    <div className={gridClass}>
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
  );
}
