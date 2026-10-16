'use client';

import React, { useMemo } from 'react';
import type { Grn, OutwardBagCategory } from '@cold-storage/contracts';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';

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

  return (
    <div style={{ marginTop: 'var(--space-2)' }}>
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
