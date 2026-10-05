'use client';

import React from 'react';
import styles from '../page.module.css';

interface TransportLogisticsSectionProps {
  grnPreview: string;
  vehicleNumber: string;
  onVehicleNumberChange: (v: string) => void;
  vehicleError?: string;
  partyMark: string;
  onPartyMarkChange: (v: string) => void;
  partyMarkError?: string;
  remarks: string;
  onRemarksChange: (v: string) => void;
}

export function TransportLogisticsSection({
  grnPreview,
  vehicleNumber, onVehicleNumberChange, vehicleError,
  partyMark, onPartyMarkChange, partyMarkError,
  remarks, onRemarksChange,
}: TransportLogisticsSectionProps) {
  return (
    <>
      <h3 className={styles.sectionHeading}>Transport &amp; Identification</h3>
      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-storage-mark" className={styles.fieldLabel}>Storage Mark</label>
          <input
            id="create-storage-mark"
            type="text"
            readOnly
            tabIndex={-1}
            value={grnPreview || 'Auto'}
            className={`${styles.fieldInput} ${styles.calculatedField}`}
            aria-label="Storage Mark (GR Number)"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-party-mark" className={styles.fieldLabel}>Party Mark</label>
          <input
            id="create-party-mark"
            type="text"
            maxLength={20}
            value={partyMark}
            onChange={(e) => onPartyMarkChange(e.target.value)}
            placeholder="e.g. KSN-99 (max 20)"
            className={`${styles.fieldInput} ${partyMarkError ? styles.inputError : ''}`}
            aria-invalid={Boolean(partyMarkError)}
          />
          {partyMarkError && <span className={styles.fieldErrorText}>{partyMarkError}</span>}
        </div>
      </div>
      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="create-vehicle" className={styles.fieldLabel}>Vehicle Registration</label>
          <input
            id="create-vehicle"
            type="text"
            maxLength={15}
            value={vehicleNumber}
            onChange={(e) => onVehicleNumberChange(e.target.value.toUpperCase())}
            placeholder="e.g. UP32AA1111"
            className={`${styles.fieldInput} ${vehicleError ? styles.inputError : ''}`}
            aria-invalid={Boolean(vehicleError)}
          />
          {vehicleError && <span className={styles.fieldErrorText}>{vehicleError}</span>}
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="create-remarks" className={styles.fieldLabel}>Remarks / Notes</label>
        <textarea
          id="create-remarks"
          rows={2}
          maxLength={500}
          value={remarks}
          onChange={(e) => onRemarksChange(e.target.value)}
          placeholder="Optional inward inspection notes or quality observations"
          className={styles.fieldInput}
        />
      </div>
    </>
  );
}
