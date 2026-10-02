'use client';

import React from 'react';
import { IndianRupee, Receipt, Wallet } from 'lucide-react';
import styles from '../page.module.css';

interface RentKpiCardsProps {
  metrics: {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
  };
}

export function RentKpiCards({ metrics }: RentKpiCardsProps) {
  return (
    <div className={styles.kpiGrid}>
      <div className={styles.kpiCard}>
        <div className={styles.kpiIconWrap}>
          <IndianRupee size={24} aria-hidden="true" />
        </div>
        <div className={styles.kpiContent}>
          <span className={styles.kpiLabel}>Total Rent Billed</span>
          <span className={styles.kpiValue}>
            ₹{metrics.totalBilled.toLocaleString('en-IN')}
          </span>
          <span className={styles.kpiSub}>Contractual obligations</span>
        </div>
      </div>

      <div className={styles.kpiCard}>
        <div className={styles.kpiIconWrapSuccess}>
          <Receipt size={24} aria-hidden="true" />
        </div>
        <div className={styles.kpiContent}>
          <span className={styles.kpiLabel}>Total Rent Collected</span>
          <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>
            ₹{metrics.totalCollected.toLocaleString('en-IN')}
          </span>
          <span className={styles.kpiSub}>Realized payments received</span>
        </div>
      </div>

      <div className={styles.kpiCard}>
        <div className={styles.kpiIconWrapWarning}>
          <Wallet size={24} aria-hidden="true" />
        </div>
        <div className={styles.kpiContent}>
          <span className={styles.kpiLabel}>Outstanding Dues</span>
          <span className={styles.kpiValue} style={{ color: 'var(--color-warning)' }}>
            ₹{metrics.totalOutstanding.toLocaleString('en-IN')}
          </span>
          <span className={styles.kpiSub}>Pending balance to be collected</span>
        </div>
      </div>
    </div>
  );
}
