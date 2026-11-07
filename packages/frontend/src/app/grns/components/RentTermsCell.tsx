'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { resolveEffectiveGrnRentType } from '@cold-storage/contracts';
import styles from './RentTermsCell.module.css';

interface RentTermsCellProps {
  row: Grn;
}

export function RentTermsCell({ row }: RentTermsCellProps) {
  const effectiveRentType = resolveEffectiveGrnRentType({
    rentType: row.rentType,
    inwardDate: row.date,
  });

  return (
    <span className={styles.termType}>
      {effectiveRentType}
    </span>
  );
}

