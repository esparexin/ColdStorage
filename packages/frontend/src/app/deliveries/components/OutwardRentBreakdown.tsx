'use client';

import React from 'react';
import {
  calculateOutwardSeasonalBreakdown,
  type RentType,
} from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import styles from './OutwardRentBreakdown.module.css';

interface OutwardRentBreakdownProps {
  rentType: RentType;
  inwardDate?: Date | string | null;
  deliveryDate: Date | string;
  smallBags: number;
  bigBags: number;
  seasonalRates: { small: number; big: number };
  monthlyRates: { small: number; big: number };
  rentMonths?: number | null;
  totalRent: number;
  pendingBalance?: number;
}

export function OutwardRentBreakdown({
  rentType,
  inwardDate,
  deliveryDate,
  smallBags,
  bigBags,
  seasonalRates,
  monthlyRates,
  rentMonths,
  totalRent,
  pendingBalance,
}: OutwardRentBreakdownProps) {
  const isSeasonal = rentType === 'Seasonal';
  const totalWithdrawing = smallBags + bigBags;

  const seasonalBreakdown = isSeasonal && inwardDate && totalWithdrawing > 0
    ? calculateOutwardSeasonalBreakdown({
        inwardDate,
        deliveryDate,
        smallBags,
        bigBags,
        seasonalRates,
        monthlyRates,
      })
    : null;

  return (
    <div className={styles.card} id="outward-rent-breakdown-card">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>Outward Rent Calculation</span>
          <Badge variant="neutral">{rentType}</Badge>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.breakdownTable}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Period</th>
              <th style={{ textAlign: 'left' }}>Calculation Formula</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {isSeasonal && seasonalBreakdown && seasonalBreakdown.periods.length > 0 ? (
              seasonalBreakdown.periods.map((p) => {
                const parts: string[] = [];
                if (p.smallBags > 0) parts.push(`${p.smallBags} S × ₹${p.smallRate}`);
                if (p.bigBags > 0) parts.push(`${p.bigBags} B × ₹${p.bigRate}`);
                const formula = parts.join(' + ') || '0 bags';
                return (
                  <tr key={p.periodKey}>
                    <td style={{ fontWeight: 'var(--font-medium)' }}>{p.label}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{formula}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)' }}>
                      ₹{p.amount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td style={{ fontWeight: 'var(--font-medium)' }}>
                  {isSeasonal ? 'Seasonal Storage' : `Monthly Storage (${rentMonths ?? 1} mo)`}
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>
                  {smallBags > 0 && bigBags > 0
                    ? `(${smallBags} S × ₹${seasonalRates.small} + ${bigBags} B × ₹${seasonalRates.big})`
                    : smallBags > 0
                    ? `${smallBags} S × ₹${seasonalRates.small}`
                    : `${bigBags} B × ₹${seasonalRates.big}`}
                  {isSeasonal ? ' × season total' : ` × ${rentMonths ?? 1} mo`}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)' }}>
                  ₹{totalRent.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td colSpan={2} style={{ textAlign: 'left' }}>
                Total Outward Rent Obligation
              </td>
              <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
                ₹{totalRent.toLocaleString('en-IN')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {pendingBalance != null && pendingBalance > 0 && (
        <div className={styles.paymentSummary}>
          <div className={styles.paymentRow}>
            <span>Pending Balance on GRN (Previous Unsettled):</span>
            <strong>₹{pendingBalance.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
