'use client';

import React, { useMemo } from 'react';
import type { Grn, OutwardBagCategory } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';
import styles from './InternalMovementModal.module.css';

export interface TransferRentAssessmentProps {
  currentGrn: Grn;
  remainingBags: number;
  movementDate: string;
  sourceBagCategory: OutwardBagCategory | '';
  sourceQuantity: number | '';
  sourceBagPrice: number | '';
  sourceSeasonalBagPrice?: number | '';
  sourceMonthlyBagPrice?: number | '';
  confirmedSmallBags: number | '';
  confirmedBigBags: number | '';
  newCustomerName?: string;
  totalPaid?: number;
  outstandingBalance?: number;
  onAssessedRentChange?: (rent: number) => void;
}

export function TransferRentAssessment({
  currentGrn,
  remainingBags,
  movementDate,
  sourceBagCategory,
  sourceQuantity,
  sourceBagPrice,
  sourceSeasonalBagPrice,
  sourceMonthlyBagPrice,
  confirmedSmallBags,
  confirmedBigBags,
  newCustomerName,
  totalPaid = 0,
  outstandingBalance,
  onAssessedRentChange,
}: TransferRentAssessmentProps) {
  const isHybrid = sourceBagCategory === 'Hybrid' || sourceBagCategory === 'Mixed';
  const smallBags = isHybrid
    ? (typeof sourceQuantity === 'number' ? sourceQuantity : remainingBags)
    : (typeof confirmedSmallBags === 'number' ? confirmedSmallBags : currentGrn.smallBags ?? 0);
  const bigBags = isHybrid ? 0 : (typeof confirmedBigBags === 'number' ? confirmedBigBags : currentGrn.bigBags ?? 0);

  const seasonalRates = useMemo(() => ({
    small: currentGrn.smallBagPrice ?? currentGrn.bagPrice ?? 10,
    big: currentGrn.bigBagPrice ?? currentGrn.bagPrice ?? 15,
  }), [currentGrn.smallBagPrice, currentGrn.bigBagPrice, currentGrn.bagPrice]);

  const monthlyRates = useMemo(() => ({
    small: currentGrn.smallBagPrice ?? currentGrn.bagPrice ?? 10,
    big: currentGrn.bigBagPrice ?? currentGrn.bagPrice ?? 15,
  }), [currentGrn.smallBagPrice, currentGrn.bigBagPrice, currentGrn.bagPrice]);

  const totalRent = useMemo(() => {
    const rent = computeOutwardRentCharge({
      rentType: currentGrn.rentType,
      bagCategory: (sourceBagCategory || 'S/B') as OutwardBagCategory,
      smallBags,
      bigBags,
      quantity: isHybrid ? smallBags : undefined,
      manualBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
      seasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
      monthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
      inwardDate: currentGrn.date,
      deliveryDate: movementDate,
      smallBagPrice: currentGrn.smallBagPrice,
      bigBagPrice: currentGrn.bigBagPrice,
      bagPrice: currentGrn.bagPrice,
    });
    onAssessedRentChange?.(rent);
    return rent;
  }, [
    currentGrn, sourceBagCategory, smallBags, bigBags, isHybrid,
    sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice, movementDate, onAssessedRentChange,
  ]);

  const balance = outstandingBalance !== undefined ? outstandingBalance : Math.max(0, totalRent - totalPaid);
  const inwardDateStr = currentGrn.date ? new Date(currentGrn.date).toISOString().slice(0, 10) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span>Ownership Transfer Rent Statement</span>
          <Badge variant={balance <= 0 ? 'success' : 'warning'}>
            {balance <= 0 ? 'Settled (₹0 Due)' : `Pending Due: ₹${balance.toLocaleString('en-IN')}`}
          </Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-1) var(--space-3)' }}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>GRN Number:</span>
            <span className={styles.detailValue}>{currentGrn.grnNumber}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Previous Owner:</span>
            <span className={styles.detailValue}>{currentGrn.customerName}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>New Owner:</span>
            <span className={styles.detailValue}>{newCustomerName || '—'}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Transfer Date:</span>
            <span className={styles.detailValue}>{movementDate}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Rent Period:</span>
            <span className={styles.detailValue}>{inwardDateStr} to {movementDate}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Total Applicable Rent:</span>
            <span className={styles.detailValue}>₹{totalRent.toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Already Paid:</span>
            <span className={styles.detailValue}>₹{totalPaid.toLocaleString('en-IN')}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Outstanding Balance:</span>
            <span className={styles.detailValue} style={{ color: balance > 0 ? 'var(--color-warning-text)' : 'var(--color-success-text)' }}>
              ₹{balance.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      <OutwardRentBreakdown
        rentType={currentGrn.rentType}
        inwardDate={currentGrn.date}
        deliveryDate={movementDate}
        smallBags={smallBags}
        bigBags={bigBags}
        bagCategory={(sourceBagCategory || 'S/B') as OutwardBagCategory}
        bagPrice={typeof sourceBagPrice === 'number' ? sourceBagPrice : currentGrn.bagPrice}
        seasonalBagPrice={typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined}
        monthlyBagPrice={typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined}
        seasonalRates={seasonalRates}
        monthlyRates={monthlyRates}
        totalRent={totalRent}
      />
    </div>
  );
}
