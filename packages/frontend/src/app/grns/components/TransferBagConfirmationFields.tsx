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
      <div className={styles.noticeBox}>
        Unverified composition ({remainingBags} bags). Confirm Small + Big split reconciling to stock.
      </div>
      <label htmlFor="transfer-confirmed-small" className={styles.inputLabel}>
        Confirmed Small Bags *
      </label>
      <Input
        id="transfer-confirmed-small"
        type="number"
        min={0}
        value={confirmedSmallBags}
        onChange={(e) => onSmallChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        required
      />
      <label htmlFor="transfer-confirmed-big" className={styles.inputLabel}>
        Confirmed Big Bags *
      </label>
      <Input
        id="transfer-confirmed-big"
        type="number"
        min={0}
        value={confirmedBigBags}
        onChange={(e) => onBigChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        required
      />
    </div>
  );
}
