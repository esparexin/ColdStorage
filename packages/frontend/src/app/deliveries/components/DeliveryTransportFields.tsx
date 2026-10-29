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
  createWeight,
  setCreateWeight,
  createRemarks,
  setCreateRemarks,
  fieldErrors = {},
}: DeliveryTransportFieldsProps) {
  const dateError = fieldErrors.date;
  const vehicleError = fieldErrors.vehicleNumber;
  const gpError = fieldErrors.gpNumber;
  const driverError = fieldErrors.driverName;

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
          {dateError && (
            <span id="delivery-date-error" className={styles.fieldErrorText} role="alert">
              {dateError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-vehicle" className={pageStyles.fieldLabel}>
            Vehicle Registration *
          </label>
          <input
            id="delivery-vehicle"
            type="text"
            required
            maxLength={15}
            className={`${pageStyles.fieldInput} ${vehicleError ? styles.inputError : ''}`}
            placeholder="e.g. UP32AA1111"
            value={createVehicleNumber}
            aria-invalid={Boolean(vehicleError)}
            aria-describedby={vehicleError ? 'delivery-vehicle-error' : undefined}
            onChange={(e) => setCreateVehicleNumber(e.target.value.toUpperCase())}
          />
          {vehicleError && (
            <span id="delivery-vehicle-error" className={styles.fieldErrorText} role="alert">
              {vehicleError}
            </span>
          )}
        </div>

        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-gp" className={pageStyles.fieldLabel}>
            Gate Pass (GP) # *
          </label>
          <input
            id="delivery-gp"
            type="text"
            required
            maxLength={50}
            className={`${pageStyles.fieldInput} ${gpError ? styles.inputError : ''}`}
            placeholder="e.g. GP-0001"
            value={createGpNumber}
            aria-invalid={Boolean(gpError)}
            aria-describedby={gpError ? 'delivery-gp-error' : undefined}
            onChange={(e) => setCreateGpNumber(e.target.value)}
          />
          {gpError && (
            <span id="delivery-gp-error" className={styles.fieldErrorText} role="alert">
              {gpError}
            </span>
          )}
        </div>
      </div>

      <div className={pageStyles.formGrid2}>
        <div className={pageStyles.fieldGroup}>
          <label htmlFor="delivery-driver" className={pageStyles.fieldLabel}>
            Driver Name *
          </label>
          <input
            id="delivery-driver"
            type="text"
            required
            maxLength={100}
            className={`${pageStyles.fieldInput} ${driverError ? styles.inputError : ''}`}
            placeholder="e.g. Ramesh Singh"
            value={createDriverName}
            aria-invalid={Boolean(driverError)}
            aria-describedby={driverError ? 'delivery-driver-error' : undefined}
            onChange={(e) => setCreateDriverName(e.target.value)}
          />
          {driverError && (
            <span id="delivery-driver-error" className={styles.fieldErrorText} role="alert">
              {driverError}
            </span>
          )}
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
    </>
  );
}
