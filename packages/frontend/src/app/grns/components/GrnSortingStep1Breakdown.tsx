'use client';

import React, { useMemo } from 'react';
import {
  calculateOutwardSeasonalBreakdown,
  resolveUncompletedPeriodKeys,
  type Commodity,
  type Grn,
  type OperationalBagType,
} from '@cold-storage/contracts';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { resolveTransferRates } from './transferRentRates.helper';

interface GrnSortingStep1BreakdownProps {
  grn: Grn;
  commodity?: Commodity | null;
  confirmedBagType: OperationalBagType;
  smallBags: number;
  bigBags: number;
}

export function GrnSortingStep1Breakdown({
  grn,
  commodity,
  confirmedBagType,
  smallBags,
  bigBags,
}: GrnSortingStep1BreakdownProps) {
  const isHybrid = confirmedBagType === 'Hybrid';
  const resolvedRates = useMemo(
    () => resolveTransferRates(grn, commodity),
    [grn, commodity],
  );

  const effectiveHamaliRate = useMemo(() => {
    if (typeof grn.hamaliRate === 'number') return grn.hamaliRate;
    const isApp = commodity?.isHamaliApplicable ?? ((commodity?.hamaliRate ?? 0) > 0);
    return isApp ? (commodity?.hamaliRate ?? 0) : 0;
  }, [grn.hamaliRate, commodity]);

  const excludePeriodKeys = useMemo(
    () => (grn.date ? resolveUncompletedPeriodKeys(grn.date, new Date()) : []),
    [grn.date],
  );

  const breakdownResult = useMemo(() => {
    if (!grn.date || smallBags + bigBags === 0) return null;

    return calculateOutwardSeasonalBreakdown({
      inwardDate: grn.date,
      deliveryDate: new Date(),
      smallBags,
      bigBags,
      seasonalRates: resolvedRates.seasonalRates,
      monthlyRates: resolvedRates.monthlyRates,
      excludePeriodKeys,
      hamaliRate: effectiveHamaliRate,
      isRatesInclusiveOfHamali: false,
    });
  }, [grn.date, smallBags, bigBags, resolvedRates, excludePeriodKeys, effectiveHamaliRate]);

  return (
    <div style={{ marginTop: 'var(--space-2)' }}>
      <div
        style={{
          marginBottom: 'var(--space-1)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)',
        }}
      >
        Historical Rent Assessment (Eligible Completed Subscriptions)
      </div>
      <OutwardRentBreakdown
        rentType={grn.rentType}
        inwardDate={grn.date}
        deliveryDate={new Date()}
        smallBags={smallBags}
        bigBags={bigBags}
        bagType={confirmedBagType}
        bagCategory={isHybrid ? 'Hybrid' : 'S/B'}
        seasonalRates={resolvedRates.seasonalRates}
        monthlyRates={resolvedRates.monthlyRates}
        totalRent={breakdownResult?.storageRent ?? 0}
        hamaliRate={effectiveHamaliRate}
        excludePeriodKeys={excludePeriodKeys}
        grnNumber={grn.grnNumber}
      />
    </div>
  );
}

