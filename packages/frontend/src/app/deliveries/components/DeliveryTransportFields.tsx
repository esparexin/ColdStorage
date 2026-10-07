'use client';

import React from 'react';
import pageStyles from '../page.module.css';
import styles from './DeliveryTransportFields.module.css';

interface DeliveryTransportFieldsProps {
  createDate: string;
  setCreateDate: (v: string) => void;
  createVehicleNumber: string;
  setCreateVehicleNumber: (v: string) => void;
  createGpNumber: string;
  setCreateGpNumber: (v: string) => void;
  createDriverName: string;
  setCreateDriverName: (v: string) => void;
  totalBagsWeight?: number | null;
  createWeight: number | '';
  setCreateWeight: (v: number | '') => void;
  createRemarks: string;
  setCreateRemarks: (v: string) => void;
  fieldErrors?: Record<string, string>;
}

export function DeliveryTransportFields({
  createDate,
  setCreateDate,
  createVehicleNumber,
  setCreateVehicleNumber,
  createGpNumber,
  setCreateGpNumber,
  createDriverName,
  setCreateDriverName,
  totalBagsWeight,
  createWeight,
  setCreateWeight,
  createRemarks,
  setCreateRemarks,
  fieldErrors = {},
}: DeliveryTransportFieldsProps) {
  const dateError = fieldErrors.date;
  const vehicleError = fieldErrors.vehicleNumber;

  return (
    <>
      <div className={styles.formGrid3}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-date" className={pageStyles.fieldLabel}>
            Delivery Date *
          </label>
          <input
            id="delivery-date"
            type="date"
            required
            className={`${pageStyles.fieldInput} ${dateError ? styles.inputError : ''}`}
            value={createDate}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'delivery-date-error' : undefined}
            onChange={(e) => setCreateDate(e.target.value)}
          />
          {dateError && <span id="delivery-date-error" className={styles.fieldErrorText} role="alert">{dateError}</span>}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-vehicle" className={pageStyles.fieldLabel}>
            Vehicle Registration
          </label>
          <input
            id="delivery-vehicle"
            type="text"
            maxLength={15}
            className={`${pageStyles.fieldInput} ${vehicleError ? styles.inputError : ''}`}
            placeholder="e.g. UP32AA1111"
            value={createVehicleNumber}
            aria-invalid={Boolean(vehicleError)}
            aria-describedby={vehicleError ? 'delivery-vehicle-error' : undefined}
            onChange={(e) => setCreateVehicleNumber(e.target.value.toUpperCase())}
          />
          {vehicleError && <span id="delivery-vehicle-error" className={styles.fieldErrorText} role="alert">{vehicleError}</span>}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-gp" className={pageStyles.fieldLabel}>
            Gate Pass (GP) #
          </label>
          <input
            id="delivery-gp"
            type="text"
            maxLength={50}
            className={pageStyles.fieldInput}
            placeholder="e.g. GP-001"
            value={createGpNumber}
            onChange={(e) => setCreateGpNumber(e.target.value)}
          />
        </div>
      </div>

      <div className={pageStyles.formGrid2}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-driver" className={pageStyles.fieldLabel}>
            Driver Name
          </label>
          <input
            id="delivery-driver"
            type="text"
            maxLength={100}
            className={pageStyles.fieldInput}
            placeholder="e.g. Ramesh Singh"
            value={createDriverName}
            onChange={(e) => setCreateDriverName(e.target.value)}
          />
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-remarks" className={pageStyles.fieldLabel}>
            Remarks
          </label>
          <input
            id="delivery-remarks"
            type="text"
            maxLength={500}
            className={pageStyles.fieldInput}
            placeholder="Optional outward delivery notes"
            value={createRemarks}
            onChange={(e) => setCreateRemarks(e.target.value)}
          />
        </div>
      </div>

      <div className={pageStyles.formGrid2}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-total-bags-weight" className={pageStyles.fieldLabel}>
            Total Bags Weight
          </label>
          <div className={styles.readOnlyFieldWrapper}>
            <input
              id="delivery-total-bags-weight"
              type="text"
              readOnly
              disabled
              className={`${pageStyles.fieldInput} ${styles.readOnlyInput}`}
              value={totalBagsWeight != null ? `${totalBagsWeight.toLocaleString('en-IN')} kg` : '—'}
              aria-readonly="true"
            />
            <span className={styles.readOnlyBadge}>Read-only</span>
          </div>
          <span className={styles.fieldHelpText}>
            Reference weight from Inward / GRN (Read-only)
          </span>
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-weight" className={pageStyles.fieldLabel}>
            Outward Weight (kg)
          </label>
          <input
            id="delivery-weight"
            type="number"
            step="0.01"
            min={0}
            className={pageStyles.fieldInput}
            placeholder="e.g. 2100"
            value={createWeight}
            onChange={(e) => setCreateWeight(e.target.value ? parseFloat(e.target.value) : '')}
          />
          <span className={styles.fieldHelpText}>
            Actual weight dispatched in this delivery
          </span>
        </div>
      </div>
    </>
  );
}
