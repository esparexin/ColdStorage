'use client';

import React, { useMemo } from 'react';
import {
  calculateOutwardSeasonalBreakdown,
  isHybridBagCategory,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';
import { Badge, DataTable } from '@/components/ui';
import { breakdownColumns, getPeriodMeta, type RentBreakdownItem } from './outwardRentBreakdown.helper';
import styles from './OutwardRentBreakdown.module.css';

export interface OutwardRentBreakdownProps {
  rentType: RentType;
  inwardDate?: Date | string | null;
  deliveryDate: Date | string;
  smallBags: number;
  bigBags: number;
  bagCategory?: OutwardBagCategory;
  bagPrice?: number | null;
  seasonalBagPrice?: number | null;
  monthlyBagPrice?: number | null;
  seasonalRates: { small: number; big: number };
  monthlyRates: { small: number; big: number };
  rentMonths?: number | null;
  totalRent: number;
  pendingBalance?: number;
  remainingStock?: number;
  totalStock?: number;
}

export function OutwardRentBreakdown({
  rentType,
  inwardDate,
  deliveryDate,
  smallBags,
  bigBags,
  bagCategory,
  bagPrice,
  seasonalBagPrice,
  monthlyBagPrice,
  seasonalRates,
  monthlyRates,
  rentMonths,
  totalRent,
  pendingBalance,
}: OutwardRentBreakdownProps) {
  const isSeasonal = rentType === 'Seasonal';
  const isHybrid = isHybridBagCategory(bagCategory);
  const totalWithdrawing = smallBags + bigBags;

  const effectiveSeasonalRates = useMemo(
    () =>
      typeof seasonalBagPrice === 'number' && seasonalBagPrice > 0
        ? { small: seasonalBagPrice, big: seasonalBagPrice }
        : seasonalRates,
    [seasonalBagPrice, seasonalRates],
  );

  const effectiveMonthlyRates = useMemo(
    () =>
      typeof monthlyBagPrice === 'number' && monthlyBagPrice > 0
        ? { small: monthlyBagPrice, big: monthlyBagPrice }
        : monthlyRates,
    [monthlyBagPrice, monthlyRates],
  );

  const seasonalBreakdown = useMemo(
    () =>
      isSeasonal && inwardDate && totalWithdrawing > 0
        ? calculateOutwardSeasonalBreakdown({
            inwardDate,
            deliveryDate,
            smallBags: isHybrid ? totalWithdrawing : smallBags,
            bigBags: isHybrid ? 0 : bigBags,
            seasonalRates: effectiveSeasonalRates,
            monthlyRates: effectiveMonthlyRates,
          })
        : null,
    [
      isSeasonal,
      inwardDate,
      totalWithdrawing,
      isHybrid,
      deliveryDate,
      smallBags,
      bigBags,
      effectiveSeasonalRates,
      effectiveMonthlyRates,
    ],
  );

  const rows = useMemo<RentBreakdownItem[]>(() => {
    if (isSeasonal && seasonalBreakdown && seasonalBreakdown.periods.length > 0) {
      return seasonalBreakdown.periods.map((p) => {
        let formula = '';
        if (isHybrid) {
          const rate = p.smallRate;
          formula = `${totalWithdrawing} Bags × ₹${rate} (₹${p.amount.toLocaleString('en-IN')})`;
        } else {
          const parts: string[] = [];
          if (p.smallBags > 0) {
            const sAmt = p.smallBags * p.smallRate;
            parts.push(`${p.smallBags} Small × ₹${p.smallRate} (₹${sAmt.toLocaleString('en-IN')})`);
          }
          if (p.bigBags > 0) {
            const bAmt = p.bigBags * p.bigRate;
            parts.push(`${p.bigBags} Big × ₹${p.bigRate} (₹${bAmt.toLocaleString('en-IN')})`);
          }
          formula = parts.join(' + ') || '0 bags';
        }
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

    const activeRates = isSeasonal ? effectiveSeasonalRates : effectiveMonthlyRates;
    let detailsFormula = '';
    if (isHybrid) {
      const perBag = bagPrice ?? activeRates.small;
      detailsFormula = `${totalWithdrawing} Bags × ₹${Number(perBag).toFixed(2)}`;
    } else {
      detailsFormula =
        smallBags > 0 && bigBags > 0
          ? `${smallBags} Small × ₹${activeRates.small} (₹${(smallBags * activeRates.small).toLocaleString('en-IN')}) + ${bigBags} Big × ₹${activeRates.big} (₹${(bigBags * activeRates.big).toLocaleString('en-IN')})`
          : smallBags > 0
          ? `${smallBags} Small × ₹${activeRates.small} (₹${(smallBags * activeRates.small).toLocaleString('en-IN')})`
          : `${bigBags} Big × ₹${activeRates.big} (₹${(bigBags * activeRates.big).toLocaleString('en-IN')})`;
    }

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
  }, [
    isSeasonal,
    seasonalBreakdown,
    isHybrid,
    totalWithdrawing,
    effectiveSeasonalRates,
    effectiveMonthlyRates,
    bagPrice,
    smallBags,
    bigBags,
    rentMonths,
    totalRent,
  ]);

  if (totalWithdrawing <= 0 && (!pendingBalance || pendingBalance <= 0)) {
    return null;
  }

  return (
    <div className={styles.card} id="outward-rent-breakdown-card">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>Outward Rent Calculation</span>
          <Badge variant="neutral">{rentType}</Badge>
        </div>
      </div>

      <DataTable
        columns={breakdownColumns}
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
