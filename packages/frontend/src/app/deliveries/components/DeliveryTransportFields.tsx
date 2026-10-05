'use client';

import React from 'react';
import styles from '../page.module.css';

interface DeliveryTransportFieldsProps {
  createDate: string;
  setCreateDate: (v: string) => void;
  createVehicleNumber: string;
  setCreateVehicleNumber: (v: string) => void;
  createMarks: string;
  setCreateMarks: (v: string) => void;
  createGpNumber: string;
  setCreateGpNumber: (v: string) => void;
  createDriverName: string;
  setCreateDriverName: (v: string) => void;
  createWeight: number | '';
  setCreateWeight: (v: number | '') => void;
  createRemarks: string;
  setCreateRemarks: (v: string) => void;
}

export function DeliveryTransportFields({
  createDate,
  setCreateDate,
  createVehicleNumber,
  setCreateVehicleNumber,
  createMarks,
  setCreateMarks,
  createGpNumber,
  setCreateGpNumber,
  createDriverName,
  setCreateDriverName,
  createWeight,
  setCreateWeight,
  createRemarks,
  setCreateRemarks,
}: DeliveryTransportFieldsProps) {
  return (
    <>
      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-date" className={styles.fieldLabel}>
            Delivery Date *
          </label>
          <input
            id="delivery-date"
            type="date"
            required
            className={styles.fieldInput}
            value={createDate}
            onChange={(e) => setCreateDate(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-vehicle" className={styles.fieldLabel}>
            Vehicle Registration
          </label>
          <input
            aria-label="e.g. UP32AA1111"
            id="delivery-vehicle"
            type="text"
            maxLength={15}
            className={styles.fieldInput}
            placeholder="e.g. UP32AA1111"
            value={createVehicleNumber}
            onChange={(e) => setCreateVehicleNumber(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-marks" className={styles.fieldLabel}>Marks</label>
          <input
            id="delivery-marks"
            type="text"
            maxLength={100}
            className={styles.fieldInput}
            placeholder="e.g. LOT-A"
            value={createMarks}
            onChange={(e) => setCreateMarks(e.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-gp" className={styles.fieldLabel}>Gate Pass (GP) #</label>
          <input
            id="delivery-gp"
            type="text"
            maxLength={50}
            className={styles.fieldInput}
            placeholder="e.g. GP-001"
            value={createGpNumber}
            onChange={(e) => setCreateGpNumber(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-driver" className={styles.fieldLabel}>Driver Name</label>
          <input
            id="delivery-driver"
            type="text"
            maxLength={100}
            className={styles.fieldInput}
            placeholder="e.g. Ramesh Singh"
            value={createDriverName}
            onChange={(e) => setCreateDriverName(e.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="delivery-weight" className={styles.fieldLabel}>Dispatch Weight (kg)</label>
          <input
            id="delivery-weight"
            type="number"
            step="0.01"
            min={0}
            className={styles.fieldInput}
            placeholder="e.g. 12500"
            value={createWeight}
            onChange={(e) => setCreateWeight(e.target.value ? parseFloat(e.target.value) : '')}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="delivery-remarks" className={styles.fieldLabel}>Remarks</label>
        <input
          id="delivery-remarks"
          type="text"
          maxLength={500}
          className={styles.fieldInput}
          placeholder="Optional outward delivery notes"
          value={createRemarks}
          onChange={(e) => setCreateRemarks(e.target.value)}
        />
      </div>
    </>
  );
}
