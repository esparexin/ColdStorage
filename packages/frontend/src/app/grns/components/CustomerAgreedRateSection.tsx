import React from 'react';
import type { RentType } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from './CustomerAgreedRateSection.module.css';

interface CustomerAgreedRateSectionProps {
  rentType: RentType;
  rentMonths?: number | '';
  rate: { small: number; big: number } | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatRate(value: number): string {
  return `₹${value.toFixed(2)}`;
}

export function CustomerAgreedRateSection({
  rentType,
  rentMonths,
  rate,
  loading,
  error,
  onRetry,
}: CustomerAgreedRateSectionProps) {
  const isSeasonal = rentType === 'Seasonal';
  const termBadgeText = isSeasonal
    ? 'Rent Type: Seasonal — Whole-season total'
    : `Rent Type: Monthly — ${typeof rentMonths === 'number' && rentMonths > 0 ? `${rentMonths} Months` : 'Selected Months'}`;
  const rateHint = isSeasonal ? '(total per bag for the Mar–Dec season)' : '(per bag per month)';

  return (
    <div id="create-rate-section" tabIndex={-1} className={styles.sectionCard} role="group" aria-label={termBadgeText}>
      <div className={styles.headerRow}>
        <span className={styles.badge}>{termBadgeText}</span>
        <span className={styles.headerHint}>{rateHint}</span>
      </div>

      {loading ? (
        <p className={styles.headerHint} role="status">Loading controller rates…</p>
      ) : error ? (
        <div className={styles.rateStatusRow}>
          <span className={styles.fieldErrorText} role="alert">{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : !rate ? (
        <div className={styles.rateStatusRow}>
          <span className={styles.fieldErrorText} role="alert">
            No active {isSeasonal ? 'seasonal' : 'monthly'} rate is configured for this commodity. Ask an administrator to configure it in the Price Controller, then retry.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        <div className={styles.rateInputsGrid}>
          <div className={styles.inputGroup}>
            <span className={styles.inputLabel}>Small Bag Rate</span>
            <span id="create-small-bag-price" tabIndex={-1} className={styles.readOnlyValue} aria-label={`Small bag rate ${formatRate(rate.small)}`}>
              {formatRate(rate.small)}
            </span>
          </div>
          <div className={styles.inputGroup}>
            <span className={styles.inputLabel}>Big Bag Rate</span>
            <span id="create-big-bag-price" tabIndex={-1} className={styles.readOnlyValue} aria-label={`Big bag rate ${formatRate(rate.big)}`}>
              {formatRate(rate.big)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
