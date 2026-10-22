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
import type { BagConfirmationValue } from './MergeBagCategoryFields';
import { deriveMergeRentAssessment } from './mergeRentAssessment.helper';

export interface MergeRentAssessmentProps {
  facilityId?: string;
  selectedSources: Grn[];
  confirmation: BagConfirmationValue;
  totalSourceBags: number;
  movedSmall: number;
  movedBig?: number;
  movementDate: string;
  repackMode: boolean;
  commodityHamaliRate?: number;
  targetGrnDate?: Date | string | null;
}

export function MergeRentAssessment({
  facilityId,
  selectedSources,
  confirmation,
  totalSourceBags,
  movedSmall,
  movedBig = 0,
  movementDate,
  repackMode,
  commodityHamaliRate = 0,
  targetGrnDate,
}: MergeRentAssessmentProps) {
  const [summaries, setSummaries] = useState<Record<string, RentSummaryDto>>({});

  useEffect(() => {
    if (!facilityId || selectedSources.length === 0) return;
    let isMounted = true;
    const missingSources = selectedSources.filter((s) => !summaries[s.id]);
    if (missingSources.length === 0) return;

    for (const source of missingSources) {
      requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(source.id)}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((dto: RentSummaryDto | null) => {
          if (isMounted && dto) {
            setSummaries((prev) => (prev[source.id] ? prev : { ...prev, [source.id]: dto }));
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [facilityId, selectedSources, summaries]);

  if (selectedSources.length === 0 || totalSourceBags <= 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      {selectedSources.map((source) => {
        const summary = summaries[source.id];
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
        const confirmedSmall = typeof confirmation?.smallBags === 'number'
          ? confirmation.smallBags
          : (typeof movedSmall === 'number' ? movedSmall : (source.smallBags ?? sourceBags));
        const confirmedBig = typeof confirmation?.bigBags === 'number'
          ? confirmation.bigBags
          : (typeof movedBig === 'number' ? movedBig : (source.bigBags ?? 0));
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
          source, summary, repackMode, commodityHamaliRate, calculatedRent,
        });

        const totalRent = calculatedRent > 0 ? calculatedRent : (historicalObligation > 0 ? historicalObligation : 0);
        const effectiveHamaliRate = commodityHamaliRate > 0 ? commodityHamaliRate : undefined;

        return (
          <div key={source.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
            />
          </div>
        );
      })}
    </div>
  );
}
