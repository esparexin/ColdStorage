import React from 'react';
import type { RentType } from '@cold-storage/contracts';
import styles from './CustomerAgreedRateSection.module.css';

interface CustomerAgreedRateSectionProps {
  rentType: RentType;
  rentMonths?: number | '';
  smallBagPrice: number | '';
  bigBagPrice: number | '';
  onSmallBagPriceChange: (val: number | '') => void;
  onBigBagPriceChange: (val: number | '') => void;
  smallBagPriceError?: string;
  bigBagPriceError?: string;
  disabled?: boolean;
}

export function CustomerAgreedRateSection({
  rentType,
  rentMonths,
  smallBagPrice,
  bigBagPrice,
  onSmallBagPriceChange,
  onBigBagPriceChange,
  smallBagPriceError,
  bigBagPriceError,
  disabled = false,
}: CustomerAgreedRateSectionProps) {
  const isSeasonal = rentType === 'Seasonal';
  const termBadgeText = isSeasonal
    ? 'Rent Type: Seasonal — 10 Months'
    : `Rent Type: Monthly — ${typeof rentMonths === 'number' && rentMonths > 0 ? `${rentMonths} Months` : 'Selected Months'}`;

  const rateUnitSuffix = isSeasonal ? '/ bag (10m)' : '/ bag / month';

  return (
    <div className={styles.sectionCard} role="group" aria-label={termBadgeText}>
      <div className={styles.headerRow}>
        <span className={styles.badge}>{termBadgeText}</span>
      </div>

      <div className={styles.rateInputsGrid}>
        <div className={styles.inputGroup}>
          <label htmlFor="create-small-bag-price" className={styles.inputLabel}>
            Small Bag Rate ({rateUnitSuffix})
          </label>
          <div className={styles.inputWrapper}>
            <span className={styles.currencyPrefix} aria-hidden="true">
              ₹
            </span>
            <input
              id="create-small-bag-price"
              type="number"
              step="0.01"
              min={0}
              disabled={disabled}
              value={smallBagPrice}
              onChange={(e) =>
                onSmallBagPriceChange(e.target.value ? parseFloat(e.target.value) : '')
              }
              placeholder="e.g. 12"
              className={`${styles.fieldInput} ${smallBagPriceError ? styles.inputError : ''}`}
              aria-invalid={Boolean(smallBagPriceError)}
              aria-describedby={
                smallBagPriceError ? 'create-small-bag-price-error' : undefined
              }
            />
          </div>
          {smallBagPriceError && (
            <span
              id="create-small-bag-price-error"
              className={styles.fieldErrorText}
              role="alert"
            >
              {smallBagPriceError}
            </span>
          )}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="create-big-bag-price" className={styles.inputLabel}>
            Big Bag Rate ({rateUnitSuffix})
          </label>
          <div className={styles.inputWrapper}>
            <span className={styles.currencyPrefix} aria-hidden="true">
              ₹
            </span>
            <input
              id="create-big-bag-price"
              type="number"
              step="0.01"
              min={0}
              disabled={disabled}
              value={bigBagPrice}
              onChange={(e) =>
                onBigBagPriceChange(e.target.value ? parseFloat(e.target.value) : '')
              }
              placeholder="e.g. 18"
              className={`${styles.fieldInput} ${bigBagPriceError ? styles.inputError : ''}`}
              aria-invalid={Boolean(bigBagPriceError)}
              aria-describedby={
                bigBagPriceError ? 'create-big-bag-price-error' : undefined
              }
            />
          </div>
          {bigBagPriceError && (
            <span id="create-big-bag-price-error" className={styles.fieldErrorText} role="alert">
              {bigBagPriceError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
