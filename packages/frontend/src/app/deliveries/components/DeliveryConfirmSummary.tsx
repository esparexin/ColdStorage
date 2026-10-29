'use client';

import React from 'react';
import {
  formatBagCompositionText,
  formatCurrencyAmount,
  formatProRataHamaliText,
} from './deliveryConfirmSummary.helper';
import styles from './DeliveryConfirmSummary.module.css';

export interface DeliveryConfirmSummaryProps {
  customerName: string;
  grnNumber: string;
  chamber: string;
  commodityName?: string;
  bagType: string;
  totalBags: number;
  smallBags: number;
  bigBags: number;
  outwardRent: number;
  hamaliRate?: number | null;
  vehicleNumber?: string;
  gpNumber?: string;
  originalBags?: number | null;
  priorDeliveredBags?: number | null;
  totalHamaliAmount?: number | null;
}

export function DeliveryConfirmSummary({
  customerName,
  grnNumber,
  chamber,
  commodityName,
  bagType,
  totalBags,
  smallBags,
  bigBags,
  outwardRent,
  hamaliRate,
  vehicleNumber,
  gpNumber,
  originalBags,
  priorDeliveredBags,
  totalHamaliAmount,
}: DeliveryConfirmSummaryProps) {
  const compositionText = formatBagCompositionText(bagType, totalBags, smallBags, bigBags);
  const hamaliText = formatProRataHamaliText(totalBags, hamaliRate, {
    originalBags,
    priorDeliveredBags,
    totalHamaliAmount,
  });

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Please confirm the outward delivery details and charges before deduction:
      </p>

      <div className={styles.detailsCard}>
        <div className={styles.grid}>
          <div className={styles.item}>
            <span className={styles.label}>Customer</span>
            <span className={styles.value}>{customerName}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Consignment (GRN)</span>
            <span className={styles.value}>
              {grnNumber} {commodityName ? `(${commodityName})` : ''}
            </span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Chamber</span>
            <span className={styles.value}>{chamber}</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Confirmed Bag Type</span>
            <span className={styles.value}>{bagType}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Total Bags</span>
            <span className={styles.highlightValue}>{totalBags} Bags</span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Composition</span>
            <span className={styles.value}>{compositionText}</span>
          </div>

          <div className={styles.item}>
            <span className={styles.label}>Outward Rent</span>
            <span className={styles.highlightValue}>
              {formatCurrencyAmount(outwardRent)}
            </span>
          </div>
          <div className={styles.item}>
            <span className={styles.label}>Pro-Rata Hamali</span>
            <span className={styles.value}>{hamaliText}</span>
          </div>

          {vehicleNumber && (
            <div className={styles.item}>
              <span className={styles.label}>Vehicle Number</span>
              <span className={styles.value}>{vehicleNumber}</span>
            </div>
          )}
          {gpNumber && (
            <div className={styles.item}>
              <span className={styles.label}>Gate Pass No.</span>
              <span className={styles.value}>{gpNumber}</span>
            </div>
          )}
        </div>
      </div>

      <p className={styles.warningNote}>
        Once finalized, stock will be permanently deducted and this operation cannot be reversed.
      </p>
    </div>
  );
}
