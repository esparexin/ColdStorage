'use client';

import React, { useEffect, useState } from 'react';
import {
  isHybridBagCategory,
  resolveSeasonalElapsedPeriods,
  seasonYearForInwardDate,
  type Grn,
  type OutwardBagCategory,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { deriveMergeRentAssessment } from './mergeRentAssessment.helper';

export interface MergeRentAssessmentProps {
  source: Grn;
  confirmation: BagConfirmationValue;
  movementDate: string;
  facilityId?: string;
  summary?: RentSummaryDto | null;
  commodityHamaliRate?: number;
  targetGrnDate?: Date | string | null;
}

export function MergeRentAssessment({
  source,
  confirmation,
  movementDate,
  facilityId,
  summary: propSummary,
  commodityHamaliRate = 0,
  targetGrnDate,
}: MergeRentAssessmentProps) {
  const [fetchedSummary, setFetchedSummary] = useState<RentSummaryDto | null>(null);

  useEffect(() => {
    if (propSummary || !facilityId || !source.id) return;
    let isMounted = true;
    requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(source.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((dto: RentSummaryDto | null) => {
        if (isMounted && dto) setFetchedSummary(dto);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [facilityId, source.id, propSummary]);

  const summary = propSummary ?? fetchedSummary;
  const sourceBags = source.closingBags ?? source.bags;

  const targetSeason = targetGrnDate ? seasonYearForInwardDate(targetGrnDate) : null;
  const sourceSeason = source.date ? seasonYearForInwardDate(source.date) : null;
  const excludePeriodKeys: string[] = [];
  if (targetSeason !== null && sourceSeason !== null && targetSeason > sourceSeason && source.date) {
    const elapsed = resolveSeasonalElapsedPeriods(source.date, movementDate);
    for (const p of elapsed) {
      if (p.period === 'SEASON' && p.seasonYear >= targetSeason) {
        excludePeriodKeys.push(p.key);
      }
    }
  }

  const isHybrid = isHybridBagCategory(confirmation?.category);
  const hasChoice = typeof confirmation?.smallBags === 'number' && typeof confirmation?.bigBags === 'number';
  if (!isHybrid && !hasChoice && !source.isCompositionVerified) {
    return (
      <div style={{ padding: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
        Storage rent calculation breakdown is unavailable for unconfirmed bag counts.
      </div>
    );
  }

  const confirmedSmall = typeof confirmation?.smallBags === 'number'
    ? confirmation.smallBags
    : (source.smallBags ?? sourceBags);
  const confirmedBig = typeof confirmation?.bigBags === 'number'
    ? confirmation.bigBags
    : (source.bigBags ?? 0);
  const smallBags = isHybrid ? sourceBags : confirmedSmall;
  const bigBags = isHybrid ? 0 : confirmedBig;
  const bagCategory = (isHybrid ? 'Hybrid' : (confirmation?.category || 'S/B')) as OutwardBagCategory;

  const seasonalRates = {
    small: source.smallBagPrice ?? source.bagPrice ?? 10,
    big: source.bigBagPrice ?? source.bagPrice ?? 15,
  };
  const monthlyRates = {
    small: source.smallBagPrice ?? source.bagPrice ?? 10,
    big: source.bigBagPrice ?? source.bagPrice ?? 15,
  };

  const manualBagPrice = typeof confirmation?.bagPrice === 'number' && confirmation.bagPrice > 0
    ? confirmation.bagPrice
    : source.bagPrice;
  const seasonalBagPrice = typeof confirmation?.seasonalBagPrice === 'number' && confirmation.seasonalBagPrice > 0
    ? confirmation.seasonalBagPrice
    : undefined;
  const monthlyBagPrice = typeof confirmation?.monthlyBagPrice === 'number' && confirmation.monthlyBagPrice > 0
    ? confirmation.monthlyBagPrice
    : undefined;

  const calculatedRent = computeOutwardRentCharge({
    rentType: source.rentType,
    bagCategory,
    smallBags,
    bigBags,
    quantity: isHybrid ? sourceBags : undefined,
    manualBagPrice: typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
    seasonalBagPrice,
    monthlyBagPrice,
    inwardDate: source.date,
    deliveryDate: movementDate,
    smallBagPrice: source.smallBagPrice,
    bigBagPrice: source.bigBagPrice,
    bagPrice: source.bagPrice,
    excludePeriodKeys,
  });

  const { historicalObligation } = deriveMergeRentAssessment({
    source,
    summary,
    repackMode: false,
    commodityHamaliRate,
    calculatedRent,
  });

  const storedRent = summary?.rentAmount ?? source.rentAmount ?? 0;
  const totalRent = Math.max(storedRent, calculatedRent);
  const effectiveHamaliRate = commodityHamaliRate > 0 ? commodityHamaliRate : undefined;

  return (
    <OutwardRentBreakdown
      rentType={source.rentType}
      inwardDate={source.date}
      deliveryDate={movementDate}
      smallBags={smallBags}
      bigBags={bigBags}
      bagCategory={bagCategory}
      bagPrice={typeof manualBagPrice === 'number' ? manualBagPrice : source.bagPrice}
      seasonalBagPrice={seasonalBagPrice}
      monthlyBagPrice={monthlyBagPrice}
      seasonalRates={seasonalRates}
      monthlyRates={monthlyRates}
      totalRent={totalRent}
      hamaliRate={effectiveHamaliRate}
      excludePeriodKeys={excludePeriodKeys}
      grnNumber={source.grnNumber}
    />
  );
}
