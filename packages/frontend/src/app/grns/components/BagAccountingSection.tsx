'use client';

import React from 'react';
import type { BagType } from '@cold-storage/contracts';
import styles from '../page.module.css';

export interface BagAccountingValues {
  bagType: BagType;
  bags: number | '';
  smallBags: number | '';
  bigBags: number | '';
  smallBagWeight: number | '';
  bigBagWeight: number | '';
  bagError?: string;
  smallBagWeightError?: string;
  bigBagWeightError?: string;
}

export interface BagAccountingHandlers {
  onBagsChange: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  onSmallBagWeightChange: (value: number | '') => void;
  onBigBagWeightChange: (value: number | '') => void;
}

interface BagAccountingSectionProps {
  values: BagAccountingValues;
  handlers: BagAccountingHandlers;
}

const toInt = (raw: string): number | '' => (raw.trim() === '' ? '' : Number.parseInt(raw, 10));
const toFloat = (raw: string): number | '' => (raw.trim() === '' ? '' : Number.parseFloat(raw));

/**
 * Presentational bag-count and per-bag weight block for the inward GRN form.
 *
 * Weight is captured per individual bag only. Column 1 holds the bag quantity,
 * column 2 the weight of that individual bag type, column 3 the existing
 * calculated total-bag accounting value. No nominal/weighbridge/total-weight
 * fields exist.
 */
export function BagAccountingSection({ values, handlers }: BagAccountingSectionProps) {
  const { bagType, bagError, smallBagWeightError, bigBagWeightError } = values;

  if (bagType === 'S+B') {
    return (
      <>
        <h3 className={styles.sectionHeading}>Quantity &amp; Weight Accounting</h3>
        <div className={styles.formGrid3}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-small-bags" className={styles.fieldLabel}>
              Small Bags Qty *
            </label>
            <input
              id="create-small-bags"
              type="number"
              min={0}
              max={100000}
              value={values.smallBags}
              onChange={(e) => handlers.onSmallBagsChange(toInt(e.target.value))}
              placeholder="e.g. 100"
              className={`${styles.fieldInput} ${bagError ? styles.inputError : ''}`}
            />
            {bagError && <span className={styles.fieldErrorText}>{bagError}</span>}
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-big-bags" className={styles.fieldLabel}>
              Big Bags Qty *
            </label>
            <input
              id="create-big-bags"
              type="number"
              min={0}
              max={100000}
              value={values.bigBags}
              onChange={(e) => handlers.onBigBagsChange(toInt(e.target.value))}
              placeholder="e.g. 20"
              className={`${styles.fieldInput} ${bagError ? styles.inputError : ''}`}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-bags-total" className={styles.fieldLabel}>
              Total Bags
            </label>
            <input
              id="create-bags-total"
              type="number"
              readOnly
              tabIndex={-1}
              value={values.bags}
              className={`${styles.fieldInput} ${styles.calculatedField}`}
              aria-label="Total Bags (Calculated)"
            />
          </div>
        </div>
        <div className={styles.formGrid3}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-both-small-bag-weight" className={styles.fieldLabel}>
              Small Bag Weight (kg) *
            </label>
            <input
              id="create-both-small-bag-weight"
              type="number"
              step="0.01"
              min={0}
              required
              value={values.smallBagWeight}
              onChange={(e) => handlers.onSmallBagWeightChange(toFloat(e.target.value))}
              placeholder="kg per small bag"
              className={`${styles.fieldInput} ${smallBagWeightError ? styles.inputError : ''}`}
              aria-invalid={Boolean(smallBagWeightError)}
            />
            {smallBagWeightError && (
              <span className={styles.fieldErrorText}>{smallBagWeightError}</span>
            )}
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-both-big-bag-weight" className={styles.fieldLabel}>
              Big Bag Weight (kg) *
            </label>
            <input
              id="create-both-big-bag-weight"
              type="number"
              step="0.01"
              min={0}
              required
              value={values.bigBagWeight}
              onChange={(e) => handlers.onBigBagWeightChange(toFloat(e.target.value))}
              placeholder="kg per big bag"
              className={`${styles.fieldInput} ${bigBagWeightError ? styles.inputError : ''}`}
              aria-invalid={Boolean(bigBagWeightError)}
            />
            {bigBagWeightError && <span className={styles.fieldErrorText}>{bigBagWeightError}</span>}
          </div>
        </div>
      </>
    );
  }

  const isSmall = bagType === 'S';

  return (
    <>
      <h3 className={styles.sectionHeading}>Quantity &amp; Weight Accounting</h3>
      <div className={styles.formGrid3}>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-bags" className={styles.fieldLabel}>
            {isSmall ? 'Small Bags Qty *' : 'Big Bags Qty *'}
          </label>
          <input
            id="create-bags"
            type="number"
            required
            min={1}
            max={100000}
            value={values.bags}
            onChange={(e) => handlers.onBagsChange(toInt(e.target.value))}
            placeholder={isSmall ? 'e.g. 250 (Small)' : 'e.g. 150 (Big)'}
            className={`${styles.fieldInput} ${bagError ? styles.inputError : ''}`}
            aria-invalid={Boolean(bagError)}
          />
          {bagError && <span className={styles.fieldErrorText}>{bagError}</span>}
        </div>
        {isSmall ? (
          <div className={styles.fieldGroup}>
            <label htmlFor="create-small-bag-weight" className={styles.fieldLabel}>
              Small Bag Weight (kg) *
            </label>
            <input
              id="create-small-bag-weight"
              type="number"
              step="0.01"
              min={0}
              required
              value={values.smallBagWeight}
              onChange={(e) => handlers.onSmallBagWeightChange(toFloat(e.target.value))}
              placeholder="kg per small bag"
              className={`${styles.fieldInput} ${smallBagWeightError ? styles.inputError : ''}`}
              aria-invalid={Boolean(smallBagWeightError)}
            />
            {smallBagWeightError && (
              <span className={styles.fieldErrorText}>{smallBagWeightError}</span>
            )}
          </div>
        ) : (
          <div className={styles.fieldGroup}>
            <label htmlFor="create-big-bag-weight" className={styles.fieldLabel}>
              Big Bag Weight (kg) *
            </label>
            <input
              id="create-big-bag-weight"
              type="number"
              step="0.01"
              min={0}
              required
              value={values.bigBagWeight}
              onChange={(e) => handlers.onBigBagWeightChange(toFloat(e.target.value))}
              placeholder="kg per big bag"
              className={`${styles.fieldInput} ${bigBagWeightError ? styles.inputError : ''}`}
              aria-invalid={Boolean(bigBagWeightError)}
            />
            {bigBagWeightError && <span className={styles.fieldErrorText}>{bigBagWeightError}</span>}
          </div>
        )}
        <div className={styles.fieldGroup}>
          <label htmlFor="create-bags-total-single" className={styles.fieldLabel}>
            Total Bags
          </label>
          <input
            id="create-bags-total-single"
            type="number"
            readOnly
            tabIndex={-1}
            value={values.bags}
            className={`${styles.fieldInput} ${styles.calculatedField}`}
            aria-label="Total Bags (Calculated)"
          />
        </div>
      </div>
    </>
  );
}
