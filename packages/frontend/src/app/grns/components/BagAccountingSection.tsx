'use client';

import React from 'react';
import { parseNumericInput } from '../hooks/createGrnForm.helper';
import styles from '../page.module.css';

export interface BagAccountingValues {
  bags: number | '';
  bagError?: string;
}

export interface BagAccountingHandlers {
  onBagsChange: (value: number | '') => void;
}

interface BagAccountingSectionProps {
  values: BagAccountingValues;
  handlers: BagAccountingHandlers;
}

/**
 * Presentational total-bag quantity block for the inward GRN form.
 *
 * Total Bags is a manual numbers-only input. Bag type is Small-only or
 * Big-only (no mixed composition), so no small/big split is captured and
 * the composition is derived server-side from bag type + total.
 */
export function BagAccountingSection({ values, handlers }: BagAccountingSectionProps) {
  const { bagError } = values;

  return (
    <>
      <h3 className={styles.sectionHeading}>Quantity Accounting</h3>
      <div className={styles.formGrid3}>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-bags" className={styles.fieldLabel}>
            Total Bags *
          </label>
          <input
            id="create-bags"
            type="text"
            inputMode="numeric"
            required
            value={values.bags}
            onChange={(e) => handlers.onBagsChange(parseNumericInput(e.target.value))}
            placeholder="e.g. 250"
            className={`${styles.fieldInput} ${bagError ? styles.inputError : ''}`}
            aria-invalid={Boolean(bagError)}
          />
          {bagError && <span className={styles.fieldErrorText}>{bagError}</span>}
        </div>
      </div>
    </>
  );
}
