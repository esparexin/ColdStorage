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

function getPeriodMeta(periodType: string) {
  if (periodType === 'JANUARY') return { type: 'Monthly Extension', range: 'Jan 1 – Jan 31' };
  if (periodType === 'FEBRUARY') return { type: 'Monthly Extension', range: 'Feb 1 – Feb 28' };
  return { type: 'Seasonal Storage', range: 'Mar 1 – Dec 31' };
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
              <th style={{ textAlign: 'left' }}>Rent Dates</th>
              <th style={{ textAlign: 'left' }}>Rent Details</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {isSeasonal && seasonalBreakdown && seasonalBreakdown.periods.length > 0 ? (
              seasonalBreakdown.periods.map((p) => {
                const parts: string[] = [];
                if (p.smallBags > 0) {
                  const sAmt = p.smallBags * p.smallRate;
                  parts.push(`${p.smallBags} Small × ₹${p.smallRate} (₹${sAmt.toLocaleString('en-IN')})`);
                }
                if (p.bigBags > 0) {
                  const bAmt = p.bigBags * p.bigRate;
                  parts.push(`${p.bigBags} Big × ₹${p.bigRate} (₹${bAmt.toLocaleString('en-IN')})`);
                }
                const formula = parts.join(' + ') || '0 bags';
                const meta = getPeriodMeta(p.periodType);
                return (
                  <tr key={p.periodKey}>
                    <td style={{ fontWeight: 'var(--font-medium)' }}>
                      <div>{p.label}</div>
                      <div className={styles.periodMeta}>{meta.type} • {meta.range}</div>
                    </td>
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
                  <div>{isSeasonal ? 'Seasonal Storage' : 'Monthly Storage'}</div>
                  <div className={styles.periodMeta}>
                    {isSeasonal ? 'Seasonal • Full season total' : `Monthly • ${rentMonths ?? 1} billing cycle${(rentMonths ?? 1) > 1 ? 's' : ''}`}
                  </div>
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>
                  {smallBags > 0 && bigBags > 0
                    ? `${smallBags} Small × ₹${seasonalRates.small} (₹${(smallBags * seasonalRates.small).toLocaleString('en-IN')}) + ${bigBags} Big × ₹${seasonalRates.big} (₹${(bigBags * seasonalRates.big).toLocaleString('en-IN')})`
                    : smallBags > 0
                    ? `${smallBags} Small × ₹${seasonalRates.small} (₹${(smallBags * seasonalRates.small).toLocaleString('en-IN')})`
                    : `${bigBags} Big × ₹${seasonalRates.big} (₹${(bigBags * seasonalRates.big).toLocaleString('en-IN')})`}
                  {isSeasonal ? '' : ` × ${rentMonths ?? 1} mo`}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)' }}>
                  ₹{totalRent.toLocaleString('en-IN')}
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td colSpan={2} style={{ textAlign: 'left' }}>
                Total Rent
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
