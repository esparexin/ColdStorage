'use client';

import React from 'react';
import { Package } from 'lucide-react';
import { resolveOutwardRates, type Grn } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { MergeBagCategoryFields, type BagConfirmationValue } from './MergeBagCategoryFields';
import { MergeRentAssessment } from './MergeRentAssessment';
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
  const rawSmall = selectedSources.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
  const rawBig = selectedSources.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} aria-hidden="true" />
            <span>Step 2: Confirm Bag Type & Storage History</span>
          </span>
          <Badge variant="primary">Bag Confirmation First</Badge>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          Confirm the incoming bag type and composition FIRST. Storage rent balances and multi-year obligations are derived directly from this confirmation.
        </div>

        <MergeBagCategoryFields
          value={confirmation}
          onChange={onConfirmationChange}
          totalMovedBags={totalSourceBags}
          rentType={confirmSource.rentType}
          inwardDate={confirmSource.date}
          movementDate={movementDate}
          submitting={submitting}
          rates={rates}
          rawSmall={rawSmall}
          rawBig={rawBig}
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
