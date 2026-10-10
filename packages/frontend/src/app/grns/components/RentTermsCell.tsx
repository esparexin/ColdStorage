'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import styles from './RentTermsCell.module.css';

interface RentTermsCellProps {
  row: Grn;
}

export function RentTermsCell({ row }: RentTermsCellProps) {
  return (
    <span className={styles.termType}>
      {row.rentType}
    </span>
  );
}

