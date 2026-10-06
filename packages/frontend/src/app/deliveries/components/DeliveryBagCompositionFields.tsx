import React from 'react';
import type { GrnInventorySummary } from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  withdrawal: GrnWithdrawal;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  fieldErrors?: Record<string, string>;
}

function getStockSummaryText(summary: GrnInventorySummary): string {
  const small = summary.availableSmallBags;
  const big = summary.availableBigBags;
  const total = summary.totalBags;
  const chamber = summary.chamber;

  if (small > 0 && big === 0) {
    return `${small.toLocaleString('en-IN')} Small Bags currently in stock in Chamber ${chamber} out of ${total.toLocaleString('en-IN')} bags received.`;
  }
  if (big > 0 && small === 0) {
    return `${big.toLocaleString('en-IN')} Big Bags currently in stock in Chamber ${chamber} out of ${total.toLocaleString('en-IN')} bags received.`;
  }
  return `${small.toLocaleString('en-IN')} Small Bags and ${big.toLocaleString('en-IN')} Big Bags are currently in stock in Chamber ${chamber} out of ${total.toLocaleString('en-IN')} bags received.`;
}

export function DeliveryBagCompositionFields({
  summary,
  withdrawal,
  onSmallBagsChange,
  onBigBagsChange,
  fieldErrors = {},
}: DeliveryBagCompositionFieldsProps) {
  const bagsError = fieldErrors.bags;
  const smallError = fieldErrors.smallBags;
  const bigError = fieldErrors.bigBags;

  return (
    <>
      <div className={styles.stockTableWrapper}>
        <table className={styles.stockTable}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Small Bags</th>
              <th style={{ textAlign: 'right' }}>Big Bags</th>
              <th style={{ textAlign: 'left' }}>Chamber</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                {summary.availableSmallBags.toLocaleString('en-IN')}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                {summary.availableBigBags.toLocaleString('en-IN')}
              </td>
              <td style={{ textAlign: 'left' }}>{summary.chamber}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.stockSummaryNote}>
        {getStockSummaryText(summary)}
      </div>

      <div className={pageStyles.formGrid2}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-small-bags" className={pageStyles.fieldLabel}>
            Small Bags to Deliver *
          </label>
          <input
            id="delivery-small-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={summary.availableSmallBags}
            placeholder="Small bags to deliver"
            className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
            value={withdrawal.smallBags}
            aria-invalid={Boolean(bagsError || smallError)}
            onChange={(e) =>
              onSmallBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')
            }
          />
          {smallError && <span className={styles.fieldErrorText}>{smallError}</span>}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-big-bags" className={pageStyles.fieldLabel}>
            Big Bags to Deliver *
          </label>
          <input
            id="delivery-big-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={summary.availableBigBags}
            placeholder="Big bags to deliver"
            className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
            value={withdrawal.bigBags}
            aria-invalid={Boolean(bagsError || bigError)}
            onChange={(e) =>
              onBigBagsChange(e.target.value ? parseInt(e.target.value, 10) : '')
            }
          />
          {bigError && <span className={styles.fieldErrorText}>{bigError}</span>}
        </div>
      </div>

      {bagsError && !smallError && !bigError && (
        <span className={styles.fieldErrorText} style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
          {bagsError}
        </span>
      )}

      <div className={pageStyles.totalDelivering}>
        Total Delivering:{' '}
        <span style={{ color: 'var(--color-primary)' }}>
          {(typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0) +
            (typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0)}
        </span>{' '}
        bags
      </div>
    </>
  );
}