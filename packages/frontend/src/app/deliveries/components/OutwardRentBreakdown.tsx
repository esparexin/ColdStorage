'use client';

import React, { useMemo } from 'react';
import {
  calculate3MAdditionalMonths,
  calculateOutwardSeasonalBreakdown,
  isHybridBagCategory,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';
import { Badge, DataTable } from '@/components/ui';
import {
  breakdownColumns,
  formatSeasonalBreakdownRows,
  appendHamaliRowIfNeeded,
  type RentBreakdownItem,
} from './outwardRentBreakdown.helper';
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
  remainingStock?: number;
  totalStock?: number;
  hamaliRate?: number | null;
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
  hamaliRate,
}: OutwardRentBreakdownProps) {
  const isSeasonal = rentType === 'Seasonal';
  const isSeasonal3M = rentType === 'Seasonal_3M';
  const isHybrid = isHybridBagCategory(bagCategory);
  const totalWithdrawing = smallBags + bigBags;
  const extra3MMonths = isSeasonal3M && inwardDate ? calculate3MAdditionalMonths(inwardDate, deliveryDate) : 0;

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
      return formatSeasonalBreakdownRows({
        periods: seasonalBreakdown.periods,
        isHybrid,
        totalWithdrawing,
        hamaliRate,
      });
    }

    const activeRates = isSeasonal || isSeasonal3M ? effectiveSeasonalRates : effectiveMonthlyRates;
    let detailsFormula = '';
    if (isHybrid) {
      const seasonalPerBag = typeof seasonalBagPrice === 'number' && seasonalBagPrice > 0
        ? seasonalBagPrice
        : typeof bagPrice === 'number' && bagPrice > 0
          ? bagPrice
          : activeRates.small;
      const monthlyPerBag = typeof monthlyBagPrice === 'number' && monthlyBagPrice > 0
        ? monthlyBagPrice
        : typeof bagPrice === 'number' && bagPrice > 0
          ? bagPrice
          : effectiveMonthlyRates.small;
      if (isSeasonal3M && extra3MMonths > 0) {
        detailsFormula = `${totalWithdrawing} Bags × ₹${Number(seasonalPerBag).toFixed(2)} (3-mo) + ${extra3MMonths} mo × ₹${Number(monthlyPerBag).toFixed(2)}`;
      } else if (isSeasonal3M) {
        detailsFormula = `${totalWithdrawing} Bags × ₹${Number(seasonalPerBag).toFixed(2)} (3-mo season total)`;
      } else if (isSeasonal) {
        detailsFormula = `${totalWithdrawing} Bags × ₹${Number(seasonalPerBag).toFixed(2)}`;
      } else {
        detailsFormula = `${totalWithdrawing} Bags × ₹${Number(monthlyPerBag).toFixed(2)}`;
      }
    } else {
      detailsFormula =
        smallBags > 0 && bigBags > 0
          ? `${smallBags} Small × ₹${activeRates.small} (₹${(smallBags * activeRates.small).toLocaleString('en-IN')}) + ${bigBags} Big × ₹${activeRates.big} (₹${(bigBags * activeRates.big).toLocaleString('en-IN')})`
          : smallBags > 0
          ? `${smallBags} Small × ₹${activeRates.small} (₹${(smallBags * activeRates.small).toLocaleString('en-IN')})`
          : `${bigBags} Big × ₹${activeRates.big} (₹${(bigBags * activeRates.big).toLocaleString('en-IN')})`;
    }

    return appendHamaliRowIfNeeded(
      [
        {
          id: 'single-period',
          title: isSeasonal ? 'Seasonal Storage' : isSeasonal3M ? 'Seasonal (3 Months) Storage' : 'Monthly Storage',
          periodMeta: '',
          details: `${detailsFormula}${isSeasonal || isSeasonal3M ? '' : ` × ${rentMonths ?? 1} mo`}`,
          amount: totalRent,
        },
      ],
      totalWithdrawing,
      hamaliRate,
    );
  }, [
    isSeasonal,
    isSeasonal3M,
    extra3MMonths,
    seasonalBreakdown,
    isHybrid,
    totalWithdrawing,
    effectiveSeasonalRates,
    effectiveMonthlyRates,
    bagPrice,
    seasonalBagPrice,
    monthlyBagPrice,
    smallBags,
    bigBags,
    rentMonths,
    totalRent,
    hamaliRate,
  ]);

  const effectiveHamaliAmount = typeof hamaliRate === 'number' && hamaliRate > 0 && totalWithdrawing > 0
    ? Number((totalWithdrawing * hamaliRate).toFixed(2))
    : 0;

  if (totalWithdrawing <= 0) {
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
          <>
            <tr className={styles.totalRow}>
              <td colSpan={2} style={{ textAlign: 'left' }}>
                {effectiveHamaliAmount > 0 ? 'Total Storage Rent' : 'Total Rent'}
              </td>
              <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
                ₹{totalRent.toLocaleString('en-IN')}
              </td>
            </tr>
            {effectiveHamaliAmount > 0 && (
              <tr className={styles.totalRow}>
                <td colSpan={2} style={{ textAlign: 'left' }}>
                  Total Amount to Pay
                </td>
                <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
                  ₹{(totalRent + effectiveHamaliAmount).toLocaleString('en-IN')}
                </td>
              </tr>
            )}
          </>
        }
      />
    </div>
  );
}
