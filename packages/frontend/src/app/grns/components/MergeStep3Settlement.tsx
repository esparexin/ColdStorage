'use client';

import React, { useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import {
  seasonYearForInwardDate,
  type Commodity,
  type Grn,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeSettlementBill, calculateMergeSourceRentSummary } from './mergeRentAssessment.helper';
import { resolveTransferRates } from './transferRentRates.helper';
import { formatGrnSeasonLabel } from './mergeSeasonDisplay.helper';
import { MergeTargetSettlementCard } from './MergeTargetSettlementCard';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

export interface MergeStep3SettlementProps {
  totalSourcePendingRent: number;
  targetGrn: Grn;
  targetConfirmation?: BagConfirmationValue;
  selectedSources: Grn[];
  sourceConfirmations: Record<string, BagConfirmationValue>;
  sourceRentSummaries?: Record<string, RentSummaryDto>;
  movementDate: string;
  commodities?: Commodity[];
  commodityHamaliRate?: number;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function MergeStep3Settlement({
  totalSourcePendingRent: _totalSourcePendingRent,
  targetGrn,
  targetConfirmation,
  selectedSources,
  sourceConfirmations,
  sourceRentSummaries,
  movementDate,
  commodities,
  commodityHamaliRate = 0,
  submitting,
  onBack,
  onNext,
}: MergeStep3SettlementProps) {
  const targetSeason = useMemo(() => seasonYearForInwardDate(targetGrn.date), [targetGrn.date]);

  const targetCommodity = useMemo(
    () => commodities?.find((c) => c.id === targetGrn.commodityId),
    [commodities, targetGrn.commodityId],
  );
  const targetSummary = sourceRentSummaries?.[targetGrn.id];
  const { seasonalRates: targetSeasonalRates, monthlyRates: targetMonthlyRates } = useMemo(
    () => resolveTransferRates(targetGrn, targetCommodity),
    [targetGrn, targetCommodity],
  );
  const targetCalc = useMemo(
    () =>
      calculateMergeSourceRentSummary({
        source: targetGrn,
        confirmation: targetConfirmation,
        movementDate,
        commodityHamaliRate,
        targetGrnDate: targetGrn.date,
        summary: targetSummary,
        commodity: targetCommodity,
      }),
    [targetGrn, targetConfirmation, movementDate, commodityHamaliRate, targetSummary, targetCommodity],
  );

  const targetPaid = targetSummary?.totalPaid ?? 0;
  const isTargetSettled =
    targetCalc.totalAmountToPay === 0 ||
    (targetPaid >= targetCalc.totalAmountToPay && targetCalc.totalAmountToPay > 0);
  const hasTargetHistoricalRent = targetCalc.totalRent > 0;

  const totalSettlementBill = useMemo(() => {
    return calculateMergeSettlementBill({
      selectedSources,
      sourceConfirmations,
      movementDate,
      commodityHamaliRate,
      targetGrn,
      targetConfirmation,
      sourceRentSummaries,
      commodities,
    });
  }, [
    selectedSources,
    sourceConfirmations,
    sourceRentSummaries,
    commodities,
    movementDate,
    commodityHamaliRate,
    targetGrn,
    targetConfirmation,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Header and Terms Overview */}
      <div className={styles.compactCard}>
        <div className={styles.cardHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={14} aria-hidden="true" />
            <span>Step 3: Rent Settlement</span>
          </span>
          <Badge variant={totalSettlementBill > 0 ? 'warning' : 'success'}>
            Settlement Bill: ₹{totalSettlementBill.toLocaleString('en-IN')}
          </Badge>
        </div>
      </div>

      {/* Outward Rent Calculation Breakdown for Each Participating GRN Profile */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* Surviving Target GRN Profile */}
        <MergeTargetSettlementCard
          targetGrn={targetGrn}
          targetSeason={targetSeason}
          hasTargetHistoricalRent={hasTargetHistoricalRent}
          isTargetSettled={isTargetSettled}
          targetCalc={targetCalc}
          targetConfirmation={targetConfirmation}
          targetSeasonalRates={targetSeasonalRates}
          targetMonthlyRates={targetMonthlyRates}
          commodityHamaliRate={commodityHamaliRate}
          movementDate={movementDate}
        />

        {/* Source Closing GRN Profiles */}
        {selectedSources.map((source) => {
          const conf = sourceConfirmations[source.id];
          const summary = sourceRentSummaries?.[source.id];
          const commodity = commodities?.find((c) => c.id === source.commodityId);
          const { seasonalRates, monthlyRates } = resolveTransferRates(source, commodity);
          const rentCalc = calculateMergeSourceRentSummary({
            source,
            confirmation: conf,
            movementDate,
            commodityHamaliRate,
            targetGrnDate: targetGrn.date,
            summary,
            commodity,
          });

          const paid = summary?.totalPaid ?? 0;
          const isSettled = rentCalc.totalAmountToPay === 0 || (paid >= rentCalc.totalAmountToPay && rentCalc.totalAmountToPay > 0);

          return (
            <div key={source.id} className={styles.compactCard} style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingBottom: 'var(--space-1-5)', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>Source GRN #{source.grnNumber}</span>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <span style={{ fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)' }}>{source.customerName || 'CUSTOMER'}</span>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>Inward:</span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>{formatDisplayDate(source.date)}</strong>
                  </span>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <Badge variant="primary">{source.closingBags ?? source.bags} Bags</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge variant="neutral">{formatGrnSeasonLabel(source.date)}</Badge>
                  <Badge variant={isSettled ? 'success' : 'neutral'}>{isSettled ? 'Settled (₹0 Due)' : 'Pending Settlement'}</Badge>
                </div>
              </div>

              <OutwardRentBreakdown
                hideHeader
                rentType={source.rentType}
                inwardDate={source.date}
                deliveryDate={movementDate}
                smallBags={rentCalc.smallBags}
                bigBags={rentCalc.bigBags}
                bagType={rentCalc.isHybrid ? 'Hybrid' : 'S/B'}
                bagPrice={rentCalc.isHybrid ? (typeof conf?.bagPrice === 'number' && conf.bagPrice > 0 ? conf.bagPrice : source.bagPrice) : undefined}
                seasonalBagPrice={rentCalc.isHybrid && typeof conf?.seasonalBagPrice === 'number' && conf.seasonalBagPrice > 0 ? conf.seasonalBagPrice : undefined}
                monthlyBagPrice={rentCalc.isHybrid && typeof conf?.monthlyBagPrice === 'number' && conf.monthlyBagPrice > 0 ? conf.monthlyBagPrice : undefined}
                seasonalRates={seasonalRates}
                monthlyRates={monthlyRates}
                totalRent={rentCalc.totalRent}
                hamaliRate={commodityHamaliRate}
                excludePeriodKeys={rentCalc.excludePeriodKeys}
                grnNumber={source.grnNumber}
              />
            </div>
          );
        })}
      </div>

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Bag Type"
        onNext={onNext}
        nextLabel="Next: Repacking & Final Preview"
        submitting={submitting}
      />
    </div>
  );
}
