'use client';

import React, { useMemo } from 'react';
import {
  calculateOutwardSeasonalBreakdown,
  type RentType,
} from '@cold-storage/contracts';
import { Badge, DataTable, type DataTableColumn } from '@/components/ui';
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
  remainingStock?: number;
  totalStock?: number;
}

interface RentBreakdownItem {
  id: string;
  title: string;
  periodMeta: string;
  details: string;
  amount: number;
}

function getPeriodMeta(periodType: string) {
  if (periodType === 'JANUARY') return { type: 'Monthly Extension', range: 'Jan 1 – Jan 31' };
  if (periodType === 'FEBRUARY') return { type: 'Monthly Extension', range: 'Feb 1 – Feb 28' };
  return { type: 'Seasonal Storage', range: 'Mar 1 – Dec 31' };
}

const columns: DataTableColumn<RentBreakdownItem>[] = [
  {
    key: 'dates',
    header: 'Rent Dates',
    render: (r) => (
      <div>
        <div style={{ fontWeight: 'var(--font-medium)' }}>{r.title}</div>
        <div className={styles.periodMeta}>{r.periodMeta}</div>
      </div>
    ),
  },
  {
    key: 'details',
    header: 'Rent Details',
    render: (r) => <span style={{ color: 'var(--color-text-secondary)' }}>{r.details}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (r) => (
      <span style={{ fontWeight: 'var(--font-medium)' }}>
        ₹{r.amount.toLocaleString('en-IN')}
      </span>
    ),
  },
];

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
  remainingStock,
  totalStock,
}: OutwardRentBreakdownProps) {
  const isSeasonal = rentType === 'Seasonal';
  const totalWithdrawing = smallBags + bigBags;
  const isFullOutward = remainingStock !== undefined && remainingStock === 0 && totalWithdrawing > 0;
  const priorPending = pendingBalance ?? 0;
  const totalDueToSettle = priorPending + totalRent;

  const seasonalBreakdown = useMemo(
    () =>
      isSeasonal && inwardDate && totalWithdrawing > 0
        ? calculateOutwardSeasonalBreakdown({
            inwardDate,
            deliveryDate,
            smallBags,
            bigBags,
            seasonalRates,
            monthlyRates,
          })
        : null,
    [isSeasonal, inwardDate, totalWithdrawing, deliveryDate, smallBags, bigBags, seasonalRates, monthlyRates],
  );

  const rows = useMemo<RentBreakdownItem[]>(() => {
    if (isSeasonal && seasonalBreakdown && seasonalBreakdown.periods.length > 0) {
      return seasonalBreakdown.periods.map((p) => {
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
        return {
          id: p.periodKey,
          title: p.label,
          periodMeta: `${meta.type} • ${meta.range}`,
          details: formula,
          amount: p.amount,
        };
      });
    }

    const detailsFormula =
      smallBags > 0 && bigBags > 0
        ? `${smallBags} Small × ₹${seasonalRates.small} (₹${(smallBags * seasonalRates.small).toLocaleString('en-IN')}) + ${bigBags} Big × ₹${seasonalRates.big} (₹${(bigBags * seasonalRates.big).toLocaleString('en-IN')})`
        : smallBags > 0
        ? `${smallBags} Small × ₹${seasonalRates.small} (₹${(smallBags * seasonalRates.small).toLocaleString('en-IN')})`
        : `${bigBags} Big × ₹${seasonalRates.big} (₹${(bigBags * seasonalRates.big).toLocaleString('en-IN')})`;

    return [
      {
        id: 'single-period',
        title: isSeasonal ? 'Seasonal Storage' : 'Monthly Storage',
        periodMeta: isSeasonal
          ? 'Seasonal • Full season total'
          : `Monthly • ${rentMonths ?? 1} billing cycle${(rentMonths ?? 1) > 1 ? 's' : ''}`,
        details: `${detailsFormula}${isSeasonal ? '' : ` × ${rentMonths ?? 1} mo`}`,
        amount: totalRent,
      },
    ];
  }, [isSeasonal, seasonalBreakdown, smallBags, bigBags, seasonalRates, rentMonths, totalRent]);

  return (
    <div className={styles.card} id="outward-rent-breakdown-card">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>Outward Rent Calculation</span>
          <Badge variant="neutral">{rentType}</Badge>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="Outward Rent Calculation Breakdown"
        footer={
          <tr className={styles.totalRow}>
            <td colSpan={2} style={{ textAlign: 'left' }}>
              Total Rent
            </td>
            <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
              ₹{totalRent.toLocaleString('en-IN')}
            </td>
          </tr>
        }
      />

      {totalWithdrawing > 0 ? (
        <div className={styles.settlementBox} id="outward-settlement-summary">
          <div className={styles.settlementHeader}>
            <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-xs)' }}>
              {isFullOutward ? 'Full Outward Settlement' : 'Partial Outward Movement'}
            </span>
            <Badge variant={isFullOutward ? 'primary' : 'neutral'}>
              {isFullOutward ? 'Closing Stock (0 Bags)' : `${remainingStock} Bags Remaining`}
            </Badge>
          </div>
          <div className={styles.paymentRow}>
            <span>Movement Outward Rent (Calculated):</span>
            <strong>₹{totalRent.toLocaleString('en-IN')}</strong>
          </div>
          <div className={styles.paymentRow}>
            <span>Prior Unsettled Rent on GRN:</span>
            <strong>₹{priorPending.toLocaleString('en-IN')}</strong>
          </div>
          <div
            className={styles.paymentRow}
            style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}
          >
            <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
              {isFullOutward ? 'Total Outstanding Due to Settle:' : 'Cumulative Liability After Dispatch:'}
            </span>
            <strong style={{ color: 'var(--color-primary-text)' }}>
              ₹{totalDueToSettle.toLocaleString('en-IN')}
            </strong>
          </div>
          <div className={styles.settlementNotice}>
            {isFullOutward
              ? 'All remaining bags dispatched. Actual calculated rent and prior unpaid dues are displayed above. Financial settlement must be finalized before GRN closure.'
              : 'Partial outward permitted without immediate settlement. Unpaid rent will carry forward as pending liability.'}
          </div>
        </div>
      ) : (
        pendingBalance != null && pendingBalance > 0 && (
          <div className={styles.paymentSummary}>
            <div className={styles.paymentRow}>
              <span>Pending Balance on GRN (Previous Unsettled):</span>
              <strong>₹{pendingBalance.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        )
      )}
    </div>
  );
}
