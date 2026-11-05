'use client';

import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import type { calculateMergeSourceRentSummary } from './mergeRentAssessment.helper';
import { formatGrnSeasonLabel } from './mergeSeasonDisplay.helper';

export interface MergeTargetSettlementCardProps {
  targetGrn: Grn;
  targetSeason: number;
  hasTargetHistoricalRent: boolean;
  isTargetSettled: boolean;
  targetCalc: ReturnType<typeof calculateMergeSourceRentSummary>;
  targetConfirmation?: BagConfirmationValue;
  targetSeasonalRates: { small: number; big: number };
  targetMonthlyRates: { small: number; big: number };
  commodityHamaliRate: number;
  movementDate: string;
}

export function MergeTargetSettlementCard({
  targetGrn,
  targetSeason,
  hasTargetHistoricalRent,
  isTargetSettled,
  targetCalc,
  targetConfirmation,
  targetSeasonalRates,
  targetMonthlyRates,
  commodityHamaliRate,
  movementDate,
}: MergeTargetSettlementCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          paddingBottom: hasTargetHistoricalRent ? 'var(--space-1-5)' : undefined,
          borderBottom: hasTargetHistoricalRent ? '1px solid var(--color-border)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Target GRN #{targetGrn.grnNumber} (Surviving Lot)
          </span>
          {targetGrn.customerName && (
            <>
              <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
              <span
                style={{
                  fontWeight: 'var(--font-semibold)',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {targetGrn.customerName}
              </span>
            </>
          )}
          <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Inward:</span>
            <strong style={{ color: 'var(--color-text-primary)' }}>{formatDisplayDate(targetGrn.date)}</strong>
          </span>
          <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
          <Badge variant="primary">{targetGrn.closingBags ?? targetGrn.bags} Bags</Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge variant="neutral">Season {targetSeason}</Badge>
          {hasTargetHistoricalRent ? (
            <Badge variant={isTargetSettled ? 'success' : 'neutral'}>
              {isTargetSettled ? 'Settled (₹0 Due)' : 'Pending Settlement'}
            </Badge>
          ) : (
            <Badge variant="success">Preserved Active Subscription (₹0 Merge Dues)</Badge>
          )}
        </div>
      </div>

      {hasTargetHistoricalRent && (
        <OutwardRentBreakdown
          hideHeader
          rentType={targetGrn.rentType}
          inwardDate={targetGrn.date}
          deliveryDate={movementDate}
          smallBags={targetCalc.smallBags}
          bigBags={targetCalc.bigBags}
          bagType={targetCalc.isHybrid ? 'Hybrid' : 'S/B'}
          bagPrice={
            targetCalc.isHybrid
              ? typeof targetConfirmation?.bagPrice === 'number' && targetConfirmation.bagPrice > 0
                ? targetConfirmation.bagPrice
                : targetGrn.bagPrice
              : undefined
          }
          seasonalBagPrice={
            targetCalc.isHybrid &&
            typeof targetConfirmation?.seasonalBagPrice === 'number' &&
            targetConfirmation.seasonalBagPrice > 0
              ? targetConfirmation.seasonalBagPrice
              : undefined
          }
          monthlyBagPrice={
            targetCalc.isHybrid &&
            typeof targetConfirmation?.monthlyBagPrice === 'number' &&
            targetConfirmation.monthlyBagPrice > 0
              ? targetConfirmation.monthlyBagPrice
              : undefined
          }
          seasonalRates={targetSeasonalRates}
          monthlyRates={targetMonthlyRates}
          totalRent={targetCalc.totalRent}
          hamaliRate={commodityHamaliRate}
          excludePeriodKeys={targetCalc.excludePeriodKeys}
          grnNumber={targetGrn.grnNumber}
        />
      )}

      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          background: 'var(--color-surface-1)',
          padding: 'var(--space-1-5)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Existing Target Stock ({targetGrn.closingBags ?? targetGrn.bags} bags):</span>
          <span style={{ fontWeight: 'var(--font-semibold)' }}>
            {hasTargetHistoricalRent
              ? `Active Season (${formatGrnSeasonLabel(movementDate)}) Preserved (Billed at Outward)`
              : `Preserved under active ${targetGrn.rentType} subscription (₹0 Merge Dues)`}
          </span>
        </div>
      </div>
    </div>
  );
}
