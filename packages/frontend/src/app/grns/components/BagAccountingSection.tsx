'use client';

import React from 'react';
import type { BagType } from '@cold-storage/contracts';
import styles from '../page.module.css';

export interface BagAccountingValues {
  bagType: BagType;
  bags: number | '';
  smallBags: number | '';
  bigBags: number | '';
  nominalUnitWeight: number | '';
  nominalTotalWeight: number | '';
  actualWeight: number | '';
  bagError?: string;
}

export interface BagAccountingHandlers {
  onBagsChange: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  onUnitWeightChange: (value: number | '') => void;
  onTotalWeightChange: (value: number | '') => void;
  onActualWeightChange: (value: number | '') => void;
}

interface BagAccountingSectionProps {
  values: BagAccountingValues;
  handlers: BagAccountingHandlers;
}

const toInt = (raw: string): number | '' => (raw.trim() === '' ? '' : Number.parseInt(raw, 10));
const toFloat = (raw: string): number | '' => (raw.trim() === '' ? '' : Number.parseFloat(raw));

/**
 * Presentational bag-count and weight accounting block for the inward GRN form.
 *
 * Bag types are the controlled S / B / S+B vocabulary. Weighbridge weight is authoritative
 * where captured; otherwise nominal total weight (bags × unit weight) applies.
 */
export function BagAccountingSection({ values, handlers }: BagAccountingSectionProps) {
  const { bagType, bagError } = values;

  return (
    <>
      <h3 className={styles.sectionHeading}>Quantity &amp; Weight Accounting</h3>
      {bagType === 'S+B' ? (
        <>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-small-bags" className={styles.fieldLabel}>
                Small Bags Quantity *
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
                Big Bags Quantity *
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
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="create-bags-total" className={styles.fieldLabel}>
                Total Bags (Calculated)
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
            <WeighbridgeField
              id="create-actual-weight-single"
              value={values.actualWeight}
              onChange={handlers.onActualWeightChange}
            />
          </div>
        </>
      ) : (
        <div className={styles.formGrid2}>
          <div className={styles.fieldGroup}>
            <label htmlFor="create-bags" className={styles.fieldLabel}>
              {bagType === 'S' ? 'Small Bags Quantity *' : 'Big Bags Quantity *'}
            </label>
            <input
              id="create-bags"
              type="number"
              required
              min={1}
              max={100000}
              value={values.bags}
              onChange={(e) => handlers.onBagsChange(toInt(e.target.value))}
              placeholder={bagType === 'S' ? 'e.g. 250 (Small)' : 'e.g. 150 (Big)'}
              className={`${styles.fieldInput} ${bagError ? styles.inputError : ''}`}
              aria-invalid={Boolean(bagError)}
            />
            {bagError && <span className={styles.fieldErrorText}>{bagError}</span>}
          </div>
          <WeighbridgeField
            id="create-actual-weight"
            value={values.actualWeight}
            onChange={handlers.onActualWeightChange}
          />
        </div>
      )}
      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-unit-weight" className={styles.fieldLabel}>
            Nominal Unit Weight (kg/bag)
          </label>
          <input
            id="create-unit-weight"
            type="number"
            step="0.01"
            min={0}
            value={values.nominalUnitWeight}
            onChange={(e) => handlers.onUnitWeightChange(toFloat(e.target.value))}
            className={styles.fieldInput}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-total-weight" className={styles.fieldLabel}>
            Nominal Total Weight (kg)
          </label>
          <input
            id="create-total-weight"
            type="number"
            step="0.01"
            min={0}
            value={values.nominalTotalWeight}
            onChange={(e) => handlers.onTotalWeightChange(toFloat(e.target.value))}
            placeholder="e.g. 12500"
            className={styles.fieldInput}
          />
        </div>
      </div>
    </>
  );
}

function WeighbridgeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | '';
  onChange: (value: number | '') => void;
}) {
  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={id} className={styles.fieldLabel}>
        Weighbridge Weight (kg) (Optional)
      </label>
      <input
        aria-label="Weighbridge Weight (kg)"
        id={id}
        type="number"
        step="0.01"
        min={0}
        value={value}
        onChange={(e) => onChange(toFloat(e.target.value))}
        className={styles.fieldInput}
      />
    </div>
  );
}