'use client';

import React from 'react';
import type { FacilityOption } from '@/context/FacilityContext';
import styles from '../page.module.css';

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.fieldError} role="alert">
      {message}
    </p>
  );
}

interface FacilityFieldsetProps {
  facilities: FacilityOption[];
  selectedIds: string[];
  error?: string;
  onToggle: (id: string) => void;
}

export function FacilityFieldset({ facilities, selectedIds, error, onToggle }: FacilityFieldsetProps) {
  return (
    <fieldset className={styles.formGroupFull}>
      <legend id="assign-facilities-legend">Assign Facilities (At least one required) *</legend>
      <div className={styles.checkboxGrid} role="group" aria-labelledby="assign-facilities-legend">
        {facilities.map((fac) => (
          <label key={fac.id} className={styles.checkboxItem}>
            <input type="checkbox" checked={selectedIds.includes(fac.id)} onChange={() => onToggle(fac.id)} />
            <span>
              {fac.name} ({fac.code})
            </span>
          </label>
        ))}
      </div>
      <FieldError id="assign-facilities-error" message={error} />
    </fieldset>
  );
}
