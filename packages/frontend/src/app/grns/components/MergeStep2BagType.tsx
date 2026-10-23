'use client';

import React from 'react';
import { Package } from 'lucide-react';
import { resolveOutwardRates, type Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { MergeBagTypeFields } from './MergeBagTypeFields';
import { MergeRentAssessment } from './MergeRentAssessment';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface MergeStep2BagTypeProps {
  confirmation: BagConfirmationValue;
  onConfirmationChange: (patch: Partial<BagConfirmationValue>) => void;
  totalSourceBags: number;
  confirmSource: Grn;
  movementDate: string;
  facilityId: string;
  selectedSources: Grn[];
  movedSmall: number;
  movedBig: number;
  commodityHamaliRate: number;
  targetGrnDate?: Date | string | null;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function MergeStep2BagType({
  confirmation,
  onConfirmationChange,
  totalSourceBags,
  confirmSource,
  movementDate,
  facilityId,
  selectedSources,
  movedSmall,
  movedBig,
  commodityHamaliRate,
  targetGrnDate,
  submitting,
  onBack,
  onNext,
}: MergeStep2BagTypeProps) {
  const rates = resolveOutwardRates(confirmSource.rentType, {
    smallBagPrice: confirmSource.smallBagPrice,
    bigBagPrice: confirmSource.bigBagPrice,
    bagPrice: confirmSource.bagPrice,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} aria-hidden="true" />
            <span>Step 2: Bag Type</span>
          </span>
          <Badge variant="primary">Bag Confirmation</Badge>
        </div>

        {selectedSources.length > 1 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
            Note: Batch-specific contract rates apply per source GRN in the breakdown below.
          </div>
        )}

        <MergeBagTypeFields
          value={confirmation}
          onChange={onConfirmationChange}
          totalMovedBags={totalSourceBags}
          rentType={confirmSource.rentType}
          inwardDate={confirmSource.date}
          movementDate={movementDate}
          submitting={submitting}
          rates={rates}
          sourceBagType={confirmSource.bagType}
        />
      </div>

      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span>Previous-Year GRN Balances & Storage Obligation</span>
          <Badge variant="neutral">Multi-Year Audit</Badge>
        </div>
        <MergeRentAssessment
          facilityId={facilityId}
          selectedSources={selectedSources}
          confirmation={confirmation}
          totalSourceBags={totalSourceBags}
          movedSmall={movedSmall}
          movedBig={movedBig}
          movementDate={movementDate}
          repackMode={false}
          commodityHamaliRate={commodityHamaliRate}
          targetGrnDate={targetGrnDate}
        />
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
