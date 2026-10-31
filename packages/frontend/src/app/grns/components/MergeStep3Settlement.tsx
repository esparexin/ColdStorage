'use client';

import React, { useMemo } from 'react';
import { DollarSign, ShieldCheck } from 'lucide-react';
import {
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
  totalSourcePendingRent,
  targetGrn,
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
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
            {totalSourcePendingRent > 0
              ? `Consolidated Outstanding: ₹${totalSourcePendingRent.toLocaleString('en-IN')}`
              : 'All Historical Obligations Settled (₹0 Due)'}
          </span>
        </div>

        {totalSourcePendingRent > 0 ? (
          <div className={`${styles.decisionCard} ${styles.decisionCardSelected}`}>
            <div className={styles.decisionHeader}>
              <span className={styles.decisionTitle}>
                <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
                <span>Pay Later · Separate Pending Bills</span>
              </span>
              <Badge variant="neutral">AGREED_PENDING</Badge>
            </div>
            <div className={styles.decisionDesc}>
              Total pending rent of ₹{totalSourcePendingRent.toLocaleString('en-IN')} across source GRNs will be carried forward under AGREED_PENDING terms as separate collectible bills. Dues must be cleared prior to outward delivery of Destination GRN #{targetGrn.grnNumber}.
            </div>
          </div>
        ) : (
          <div className={styles.noticeBox} style={{ color: 'var(--color-success-text)', borderColor: 'var(--color-success)' }}>
            ✓ All source GRN obligations are fully settled. No pending balance carried forward.
          </div>
        )}

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 'var(--space-1)' }}>
          Destination GRN #{targetGrn.grnNumber} retains its active subscription (Season {targetSeason}) without recalculating historical destination rent.
        </div>
      </div>

      {/* Outward Rent Calculation Breakdown for Each Source GRN */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

          const isSettled = source.rentPaymentStatus === 'Settled' || (summary && summary.remainingBalance === 0);
          const pendingDues = summary?.remainingBalance ?? source.rentRemainingBalance ?? 0;

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                    Source GRN #{source.grnNumber}
                  </span>
                  {source.customerName && (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      — {source.customerName}
                    </span>
                  )}
                  <Badge variant="neutral">Season {seasonYearForInwardDate(source.date)}</Badge>
                </div>
                <Badge variant={isSettled ? 'success' : 'warning'}>
                  {isSettled ? 'Settled (₹0 Due)' : `₹${pendingDues.toLocaleString('en-IN')} Pending`}
                </Badge>
              </div>

              <OutwardRentBreakdown
                rentType={source.rentType}
                inwardDate={source.date}
                deliveryDate={movementDate}
                smallBags={rentCalc.smallBags}
                bigBags={rentCalc.bigBags}
                bagType={rentCalc.isHybrid ? 'Hybrid' : 'S/B'}
                bagPrice={typeof conf?.bagPrice === 'number' && conf.bagPrice > 0 ? conf.bagPrice : source.bagPrice}
                seasonalBagPrice={typeof conf?.seasonalBagPrice === 'number' && conf.seasonalBagPrice > 0 ? conf.seasonalBagPrice : undefined}
                monthlyBagPrice={typeof conf?.monthlyBagPrice === 'number' && conf.monthlyBagPrice > 0 ? conf.monthlyBagPrice : undefined}
                seasonalRates={seasonalRates}
                monthlyRates={monthlyRates}
                totalRent={rentCalc.totalRent}
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
