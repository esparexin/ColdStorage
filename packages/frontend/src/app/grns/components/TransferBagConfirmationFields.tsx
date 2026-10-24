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
        <Input
          id="transfer-confirmed-small"
          label="Small Bags"
          type="number"
          min={0}
          max={remainingBags}
          value={confirmedSmallBags}
          onChange={(e) => onSmallChange(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={disabled}
          required
        />
        <Input
          id="transfer-confirmed-big"
          label="Big Bags"
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
  );
}
