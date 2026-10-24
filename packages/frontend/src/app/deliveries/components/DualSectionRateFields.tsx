'use client';

import React from 'react';
import styles from './MergedDualSectionDelivery.module.css';

interface DualSectionRateFieldsProps {
  idPrefix: string;
  isHybrid: boolean;
  showSeasonal: boolean;
  showMonthly: boolean;
  seasonalPrice: number | '';
  onSeasonalChange: (val: number | '') => void;
  monthlyPrice: number | '';
  onMonthlyChange: (val: number | '') => void;
  rateLabel: string;
  ratePerBag: number;
}

export function DualSectionRateFields({
  idPrefix,
  isHybrid,
  showSeasonal,
  showMonthly,
  seasonalPrice,
  onSeasonalChange,
  monthlyPrice,
  onMonthlyChange,
  rateLabel,
  ratePerBag,
}: DualSectionRateFieldsProps) {
  if (!isHybrid) {
    return (
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Applicable Rate</span>
        <div className={styles.rateInfo}>
          <span>{rateLabel}: ₹{ratePerBag}/bag</span>
        </div>
      </div>
    );
  }

  const parseVal = (e: React.ChangeEvent<HTMLInputElement>) =>
    e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0);

  return (
    <>
      {showSeasonal && (
        <div className={styles.fieldGroup}>
          <label htmlFor={`${idPrefix}-seasonal-rate`} className={styles.fieldLabel}>
            Seasonal Rate (₹/bag)
          </label>
          <input
            id={`${idPrefix}-seasonal-rate`}
            aria-label="Seasonal Rate (₹/bag)"
            type="number"
            min={0}
            step="0.01"
            value={seasonalPrice}
            onChange={(e) => onSeasonalChange(parseVal(e))}
            placeholder="0.00"
            className={styles.inputNumber}
          />
        </div>
      )}
      {showMonthly && (
        <div className={styles.fieldGroup}>
          <label htmlFor={`${idPrefix}-monthly-rate`} className={styles.fieldLabel}>
            Monthly Rate (₹/bag)
          </label>
          <input
            id={`${idPrefix}-monthly-rate`}
            aria-label="Monthly Rate (₹/bag)"
            type="number"
            min={0}
            step="0.01"
            value={monthlyPrice}
            onChange={(e) => onMonthlyChange(parseVal(e))}
            placeholder="0.00"
            className={styles.inputNumber}
          />
        </div>
      )}
      {!showSeasonal && !showMonthly && (
        <div className={styles.fieldGroup}>
          <label htmlFor={`${idPrefix}-rate`} className={styles.fieldLabel}>
            Rate (₹/bag)
          </label>
          <input
            id={`${idPrefix}-rate`}
            aria-label="Rate (₹/bag)"
            type="number"
            min={0}
            step="0.01"
            value={seasonalPrice}
            onChange={(e) => onSeasonalChange(parseVal(e))}
            placeholder="0.00"
            className={styles.inputNumber}
          />
        </div>
      )}
    </>
  );
}
