'use client';

import React from 'react';
import { Input } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

interface Props {
  remainingBags: number;
  confirmedSmallBags: number | '';
  confirmedBigBags: number | '';
  onSmallChange: (v: number | '') => void;
  onBigChange: (v: number | '') => void;
  disabled?: boolean;
}

export function TransferBagConfirmationFields({
  remainingBags,
  confirmedSmallBags,
  confirmedBigBags,
  onSmallChange,
  onBigChange,
  disabled,
}: Props) {
  return (
    <div className={styles.formSection}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="transfer-confirmed-small" className={styles.inputLabel}>
            Small Bags
          </label>
          <Input
            id="transfer-confirmed-small"
            type="number"
            min={0}
            max={remainingBags}
            value={confirmedSmallBags}
            onChange={(e) => onSmallChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            required
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="transfer-confirmed-big" className={styles.inputLabel}>
            Big Bags
          </label>
          <Input
            id="transfer-confirmed-big"
            type="number"
            min={0}
            max={remainingBags}
            value={confirmedBigBags}
            onChange={(e) => onBigChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            required
          />
        </div>
      </div>
    </div>
  );
}
