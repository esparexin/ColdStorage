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
  const maxSmall = Math.max(0, remainingBags - (typeof confirmedBigBags === 'number' ? confirmedBigBags : 0));
  const maxBig = Math.max(0, remainingBags - (typeof confirmedSmallBags === 'number' ? confirmedSmallBags : 0));

  return (
    <>
      <Input
        id="transfer-confirmed-small"
        label="Small Bags"
        type="number"
        min={0}
        max={maxSmall}
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
        max={maxBig}
        value={confirmedBigBags}
        onChange={(e) => onBigChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        required
      />
    </>
  );
}
