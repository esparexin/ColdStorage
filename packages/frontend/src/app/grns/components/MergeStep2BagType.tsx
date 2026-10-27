'use client';

import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
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
  targetGrnDate?: Date | string | null;
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
  targetGrnDate,
  submitting,
  onBack,
  onNext,
  sourceRentSummaries,
}: MergeStep2BagTypeProps) {
  const grandTotalRent = useMemo(
    () =>
      calculateMergeGrandTotal({
        selectedSources,
        sourceConfirmations,
        movementDate,
        commodityHamaliRate,
        targetGrnDate,
        sourceRentSummaries,
      }),
    [selectedSources, sourceConfirmations, movementDate, commodityHamaliRate, targetGrnDate, sourceRentSummaries],
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
              {selectedSources.length > 1 ? `Consolidated Pool: ${totalSourceBags} Bags (${selectedSources.length} GRNs)` : `${totalSourceBags} Bags`}
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
          Note: Configure bag type and confirmed counts for each source GRN being merged.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
