'use client';

import React, { useMemo } from 'react';
import { Package, ShieldCheck } from 'lucide-react';
import { formatDisplayBagType, type Commodity, type Grn, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeGrandTotal } from './mergeRentAssessment.helper';
import { MergeSourceGrnCard } from './MergeSourceGrnCard';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface MergeStep2BagTypeProps {
  sourceConfirmations: Record<string, BagConfirmationValue>;
  onSourceConfirmationChange: (grnId: string, patch: Partial<BagConfirmationValue>) => void;
  totalSourceBags: number;
  movementDate: string;
  facilityId: string;
  selectedSources: Grn[];
  commodityHamaliRate: number;
  targetGrn: Grn;
  targetSeason: number;
  targetCurrentRemaining: number;
  isTargetHybrid: boolean;
  targetGrnDate?: Date | string | null;
  commodities?: Commodity[];
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  sourceRentSummaries?: Record<string, RentSummaryDto>;
}

export function MergeStep2BagType({
  sourceConfirmations,
  onSourceConfirmationChange,
  totalSourceBags,
  movementDate,
  facilityId,
  selectedSources,
  commodityHamaliRate,
  targetGrn,
  targetSeason,
  targetCurrentRemaining,
  isTargetHybrid,
  targetGrnDate,
  commodities,
  submitting,
  onBack,
  onNext,
  sourceRentSummaries,
}: MergeStep2BagTypeProps) {
  const participatingGrnCount = 1 + selectedSources.length;
  const targetDisplayType = formatDisplayBagType({
    bagType: targetGrn.bagType,
    smallBags: targetGrn.smallBags,
    bigBags: targetGrn.bigBags,
    isHybrid: isTargetHybrid,
    isCompositionVerified: targetGrn.isCompositionVerified,
  });

  const grandTotalRent = useMemo(
    () =>
      calculateMergeGrandTotal({
        selectedSources,
        sourceConfirmations,
        movementDate,
        commodityHamaliRate,
        targetGrnDate,
        sourceRentSummaries,
        commodities,
      }),
    [selectedSources, sourceConfirmations, movementDate, commodityHamaliRate, targetGrnDate, sourceRentSummaries, commodities],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader} style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} aria-hidden="true" />
            <span>Step 2: Bag Type & History</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Badge variant="neutral">
              Consolidated Pool: {totalSourceBags} Bags ({participatingGrnCount} Participating GRNs)
            </Badge>
            {grandTotalRent > 0 ? (
              <Badge variant="warning">
                Pending Source Dues: ₹{grandTotalRent.toLocaleString('en-IN')}
              </Badge>
            ) : (
              <Badge variant="success">All Source Dues Settled</Badge>
            )}
          </div>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {participatingGrnCount} participating GRN profiles: Destination GRN #{targetGrn.grnNumber} (Surviving) + {selectedSources.length} Source GRN{selectedSources.length === 1 ? '' : 's'} (Closing). Source stock remains {totalSourceBags} bags.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* Destination GRN Profile Card (Surviving / Receiving) */}
        <div
          className={styles.compactCard}
          id={`destination-card-${targetGrn.id}`}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                Target GRN #{targetGrn.grnNumber} (Merge Destination)
              </span>
              {targetGrn.customerName && (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  — {targetGrn.customerName}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Badge variant="primary">Receiving Lot (Surviving)</Badge>
              <Badge variant="neutral">Season {targetSeason}</Badge>
              <Badge variant="neutral">{targetCurrentRemaining} Bags</Badge>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              background: 'var(--color-surface-1)',
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Customer</span>
              <span style={{ fontWeight: 'var(--font-medium)' }}>{targetGrn.customerName}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Commodity / Chamber</span>
              <span style={{ fontWeight: 'var(--font-medium)' }}>
                {targetGrn.commodityName} (Ch. {targetGrn.chamber})
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>
                {targetGrn.isCompositionVerified ? 'Confirmed Bag Type' : 'Bag Classification'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <Badge variant={targetGrn.isCompositionVerified ? 'neutral' : 'warning'}>{targetDisplayType}</Badge>
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Current Existing Stock</span>
              <span style={{ fontWeight: 'var(--font-bold)' }}>{targetCurrentRemaining} Bags</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Active Subscription</span>
              <span style={{ fontWeight: 'var(--font-medium)' }}>
                {targetGrn.rentType} (Preserved)
              </span>
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Destination GRN profile and active subscription are preserved. Incoming stock ({totalSourceBags} bags) will be consolidated into this lot without recalculating historical destination rent.
          </div>
        </div>

        {/* Source GRNs Cards (Closing Lots) */}
        {selectedSources.map((source) => (
          <MergeSourceGrnCard
            key={source.id}
            source={source}
            confirmation={sourceConfirmations[source.id]}
            onConfirmationChange={(patch) => onSourceConfirmationChange(source.id, patch)}
            movementDate={movementDate}
            facilityId={facilityId}
            submitting={submitting}
            commodityHamaliRate={commodityHamaliRate}
            targetGrnDate={targetGrnDate}
            summary={sourceRentSummaries?.[source.id]}
            commodity={commodities?.find((c) => c.id === source.commodityId)}
          />
        ))}
      </div>

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Batches"
        onNext={onNext}
        nextLabel="Next: Rent Settlement Decision"
        submitting={submitting}
      />
    </div>
  );
}
