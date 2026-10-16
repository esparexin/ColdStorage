'use client';

import React from 'react';
import {
  isHybridBagCategory,
  type Grn,
} from '@cold-storage/contracts';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';
import type { BagConfirmationValue } from './MergeBagCategoryFields';

export interface MergeRentAssessmentProps {
  selectedSources: Grn[];
  confirmation: BagConfirmationValue;
  totalSourceBags: number;
  movedSmall: number;
  movedBig?: number;
  movementDate: string;
  repackMode: boolean;
  commodityHamaliRate?: number;
}

export function MergeRentAssessment({
  selectedSources,
  confirmation,
  totalSourceBags,
  movedSmall,
  movedBig: _movedBig,
  movementDate,
  repackMode,
  commodityHamaliRate,
}: MergeRentAssessmentProps) {
  if (selectedSources.length === 0 || totalSourceBags <= 0) return null;

  const isHybrid = isHybridBagCategory(confirmation.category);

  return (
    <div style={{ marginTop: 'var(--space-2)' }}>
      {selectedSources.map((source) => {
        const sourceBags = source.closingBags ?? source.bags;
        const sourceScale = totalSourceBags > 0 ? sourceBags / totalSourceBags : 1;
        const sSmall = isHybrid ? sourceBags : Math.round(movedSmall * sourceScale);
        const sBig = isHybrid ? 0 : sourceBags - sSmall;

        const seasonalRates = {
          small: source.smallBagPrice ?? source.bagPrice ?? 10,
          big: source.bigBagPrice ?? source.bagPrice ?? 15,
        };
        const monthlyRates = {
          small: source.smallBagPrice ?? source.bagPrice ?? 10,
          big: source.bigBagPrice ?? source.bagPrice ?? 15,
        };

        const totalRent = computeOutwardRentCharge({
          rentType: source.rentType,
          bagCategory: confirmation.category,
          smallBags: sSmall,
          bigBags: sBig,
          quantity: isHybrid ? sourceBags : undefined,
          manualBagPrice: typeof confirmation.bagPrice === 'number' ? confirmation.bagPrice : undefined,
          seasonalBagPrice: typeof confirmation.seasonalBagPrice === 'number' ? confirmation.seasonalBagPrice : undefined,
          monthlyBagPrice: typeof confirmation.monthlyBagPrice === 'number' ? confirmation.monthlyBagPrice : undefined,
          inwardDate: source.date,
          deliveryDate: movementDate,
          smallBagPrice: source.smallBagPrice,
          bigBagPrice: source.bigBagPrice,
          bagPrice: source.bagPrice,
        });

        return (
          <div key={source.id} style={{ marginBottom: 'var(--space-2)' }}>
            {selectedSources.length > 1 && (
              <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                Source GRN {source.grnNumber} ({sourceBags} bags, Inward: {new Date(source.date).toLocaleDateString('en-IN')})
              </div>
            )}
            <OutwardRentBreakdown
              rentType={source.rentType}
              inwardDate={source.date}
              deliveryDate={movementDate}
              smallBags={sSmall}
              bigBags={sBig}
              bagCategory={confirmation.category}
              bagPrice={typeof confirmation.bagPrice === 'number' ? confirmation.bagPrice : source.bagPrice}
              seasonalBagPrice={typeof confirmation.seasonalBagPrice === 'number' ? confirmation.seasonalBagPrice : undefined}
              monthlyBagPrice={typeof confirmation.monthlyBagPrice === 'number' ? confirmation.monthlyBagPrice : undefined}
              seasonalRates={seasonalRates}
              monthlyRates={monthlyRates}
              totalRent={totalRent}
              hamaliRate={repackMode ? commodityHamaliRate : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
