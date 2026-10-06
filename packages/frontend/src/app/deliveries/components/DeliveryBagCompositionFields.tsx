import React from 'react';
import type { BagType, GrnInventorySummary } from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  /** Declared bag type from the selected Inward GRN — the authoritative source. */
  bagType: BagType;
  withdrawal: GrnWithdrawal;
  onQuantityChange: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  fieldErrors?: Record<string, string>;
}

const BAG_TYPE_LABEL: Record<BagType, string> = {
  S: 'S — Small',
  B: 'B — Big',
  'S+B': 'S+B',
};

function getStockSummaryText(summary: GrnInventorySummary): string {
  const small = summary.availableSmallBags;
  const big = summary.availableBigBags;
  const total = summary.totalBags;
  const chamber = summary.chamber;
  const available = small + big;

  if (small > 0 && big > 0) {
    return `${small.toLocaleString('en-IN')} Small Bags and ${big.toLocaleString('en-IN')} Big Bags are currently in stock in Chamber ${chamber} out of ${total.toLocaleString('en-IN')} bags received.`;
  }
  const side = big > 0 ? 'Big' : 'Small';
  return `${available.toLocaleString('en-IN')} ${side} Bags currently in stock in Chamber ${chamber} out of ${total.toLocaleString('en-IN')} bags received.`;
}

export function DeliveryBagCompositionFields({
  summary,
  bagType,
  withdrawal,
  onQuantityChange,
  onSmallBagsChange,
  onBigBagsChange,
  fieldErrors = {},
}: DeliveryBagCompositionFieldsProps) {
  const bagsError = fieldErrors.bags;
  const smallError = fieldErrors.smallBags;
  const bigError = fieldErrors.bigBags;

  const availableTotal = summary.availableSmallBags + summary.availableBigBags;
  // Single-sided when one side is zero — always true for GRNs created by the current
  // Inward Form (Total Bags + Bag Type normalize server-side to one side). Both sides
  // above zero can only come from the administrative GRN correction workflow, where a
  // single quantity cannot express the split, so the side inputs remain for that case.
  const isTwoSided = summary.availableSmallBags > 0 && summary.availableBigBags > 0;
  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const quantity = smallQty + bigQty;
  const hasEntry = withdrawal.smallBags !== '' || withdrawal.bigBags !== '';

  return (
    <>
      <div className={styles.stockTableWrapper}>
        <table className={styles.stockTable}>
          <caption className={styles.stockCaption}>Current stock from the selected Inward GRN</caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Available</th>
              <th style={{ textAlign: 'left' }}>Bag Type</th>
              <th style={{ textAlign: 'left' }}>Chamber</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                {availableTotal.toLocaleString('en-IN')} bags
              </td>
              <td style={{ textAlign: 'left' }}>{BAG_TYPE_LABEL[bagType]}</td>
              <td style={{ textAlign: 'left' }}>{summary.chamber}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.stockSummaryNote}>
        {getStockSummaryText(summary)}
      </div>

      {!isTwoSided ? (
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-bags" className={pageStyles.fieldLabel}>
            Bags to Deliver *
          </label>
          <input
            id="delivery-bags"
            type="number"
            inputMode="numeric"
            min={0}
            max={availableTotal}
            placeholder="Bags to deliver"
            className={`${pageStyles.fieldInput} ${bagsError || smallError || bigError ? styles.inputError : ''}`}
            value={hasEntry ? quantity : ''}
            aria-invalid={Boolean(bagsError || smallError || bigError)}
            onChange={(e) =>
              onQuantityChange(e.target.value ? parseInt(e.target.value, 10) : '')
            }
          />
          {(bagsError || smallError || bigError) && (
            <span className={styles.fieldErrorText}>{bagsError ?? smallError ?? bigError}</span>
          )}
        </div>
      ) : (
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
      )}

      {bagsError && isTwoSided && !smallError && !bigError && (
        <span className={styles.fieldErrorText} style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
          {bagsError}
        </span>
      )}

      <div className={pageStyles.totalDelivering}>
        Total Delivering:{' '}
        <span style={{ color: 'var(--color-primary)' }}>
          {quantity}
        </span>{' '}
        bags
      </div>
    </>
  );
}
