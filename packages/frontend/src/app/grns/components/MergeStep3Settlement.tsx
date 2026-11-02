'use client';

import React, { useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import {
  calculateHamaliAmount,
  seasonYearForInwardDate,
  type Commodity,
  type Grn,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeSourceRentSummary } from './mergeRentAssessment.helper';
import { resolveTransferRates } from './transferRentRates.helper';
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Header and Terms Overview */}
      <div className={styles.compactCard}>
        <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={14} aria-hidden="true" />
            <span>Step 3: Rent Settlement</span>
          </span>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Destination GRN #{targetGrn.grnNumber} retains its active subscription (Season {targetSeason}) without recalculating historical destination rent.
        </div>
      </div>

      {/* Outward Rent Calculation Breakdown for Each Participating GRN Profile */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* Surviving Target GRN Profile (Active Subscription Preserved) */}
        {(() => {
          const targetCommodity = commodities?.find((c) => c.id === targetGrn.commodityId);
          const tSummary = sourceRentSummaries?.[targetGrn.id];
          const tCalc = calculateMergeSourceRentSummary({
            source: targetGrn,
            confirmation: targetConfirmation,
            movementDate,
            commodityHamaliRate,
            summary: tSummary,
            commodity: targetCommodity,
          });
          const tBags = tCalc.totalBags;
          const tHamali = calculateHamaliAmount(tBags, commodityHamaliRate);
          const tDueNow = tHamali;

          return (
            <div
              className={styles.compactCard}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                    Target GRN #{targetGrn.grnNumber} (Surviving Lot)
                  </span>
                  {targetGrn.customerName && (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      — {targetGrn.customerName}
                    </span>
                  )}
                  <Badge variant="primary">Active Subscription</Badge>
                  <Badge variant="neutral">Season {targetSeason}</Badge>
                </div>
                <Badge variant={tDueNow > 0 ? 'warning' : 'primary'}>
                  {tDueNow > 0 ? `₹${tDueNow.toLocaleString('en-IN')} Due (Hamali)` : 'Active (Preserved)'}
                </Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', background: 'var(--color-surface-1)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Current Season ({targetSeason}) Storage Rent:</span>
                  <span style={{ fontWeight: 'var(--font-semibold)' }}>
                    ₹{tCalc.totalRent.toLocaleString('en-IN')} <span style={{ color: 'var(--color-primary-text)' }}>(Preserved — Continues Until Outward Delivery)</span>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Previous Monthly Subscriptions:</span>
                  <span>₹0 (None used)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Hamali Charge ({tBags} bags @ ₹{commodityHamaliRate}/bag):</span>
                  <strong style={{ color: tHamali > 0 ? 'var(--color-primary-text)' : 'inherit' }}>₹{tHamali.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '4px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'var(--font-bold)' }}>
                  <span>Target Profile Due Now:</span>
                  <span>₹{tDueNow.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          );
        })()}

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
          const pendingDues = Math.max(0, rentCalc.totalAmountToPay - paid);
          const isSettled = rentCalc.totalAmountToPay === 0 || (paid >= rentCalc.totalAmountToPay && rentCalc.totalAmountToPay > 0);

          return (
            <div
              key={source.id}
              className={styles.compactCard}
              style={{
                background: 'var(--color-surface-1)',
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
                  paddingBottom: 'var(--space-1-5)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                    Source GRN #{source.grnNumber}
                  </span>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)' }}>
                    {source.customerName || 'CUSTOMER'}
                  </span>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <Badge variant="neutral">Season {seasonYearForInwardDate(source.date)}</Badge>
                  <span style={{ color: 'var(--color-border)', userSelect: 'none' }}>|</span>
                  <Badge variant={isSettled ? 'success' : 'warning'}>
                    {isSettled ? 'Settled (₹0 Due)' : `₹${pendingDues.toLocaleString('en-IN')} Pending`}
                  </Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>
                    Outward Rent Calculation ({source.rentType})
                  </span>
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
