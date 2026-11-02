'use client';

import React from 'react';
import {
  type Commodity,
  type Grn,
  type OperationalBagType,
} from '@cold-storage/contracts';
import { Input } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import { MergeStep4RepackSection } from './MergeStep4RepackSection';
import { resolveTransferRates } from './transferRentRates.helper';
import styles from './InternalMovementModal.module.css';

interface MergeStep4RepackConfirmProps {
  destinationChamber: string; onDestinationChamberChange: (val: string) => void;
  partyMark: string; onPartyMarkChange: (val: string) => void;
  storageMark: string; onStorageMarkChange: (val: string) => void;
  repackMode: boolean; onRepackModeChange: (active: boolean) => void;
  repackBagType: OperationalBagType; onRepackBagTypeChange: (type: OperationalBagType) => void;
  repackSmall: number | ''; onRepackSmallChange: (val: number | '') => void;
  repackBig: number | ''; onRepackBigChange: (val: number | '') => void;
  repackQuantity: number | ''; onRepackQuantityChange: (val: number | '') => void;
  repackSeasonalBagPrice: number | ''; onRepackSeasonalBagPriceChange: (val: number | '') => void;
  repackMonthlyBagPrice: number | ''; onRepackMonthlyBagPriceChange: (val: number | '') => void;
  repackBagPrice: number | ''; onRepackBagPriceChange: (val: number | '') => void;
  totalSourceBags: number; referenceWeight: number | ''; onReferenceWeightChange: (val: number | '') => void;
  totalConsolidatedBags?: number;
  repackHamaliCharge: number; actualRepackedBags: number; commodityHamaliRate: number;
  movementDate: string; targetGrn: Grn;
  reason: string; onReasonChange: (r: string) => void; remarks: string; onRemarksChange: (r: string) => void;
  selectedSourcesCount: number; submitting: boolean; onBack: () => void;
  commodities?: Commodity[];
}

export function MergeStep4RepackConfirm(props: MergeStep4RepackConfirmProps) {
  const {
    destinationChamber, onDestinationChamberChange,
    partyMark, onPartyMarkChange, storageMark, onStorageMarkChange,
    repackMode, onRepackModeChange, repackBagType, onRepackBagTypeChange,
    repackSmall, onRepackSmallChange, repackBig, onRepackBigChange,
    repackQuantity, onRepackQuantityChange, repackSeasonalBagPrice, onRepackSeasonalBagPriceChange,
    repackMonthlyBagPrice, onRepackMonthlyBagPriceChange, repackBagPrice, onRepackBagPriceChange,
    totalSourceBags, referenceWeight, onReferenceWeightChange, repackHamaliCharge,
    actualRepackedBags, commodityHamaliRate, movementDate, targetGrn,
    reason, onReasonChange, remarks, onRemarksChange, selectedSourcesCount,
    submitting, onBack, totalConsolidatedBags, commodities,
  } = props;

  const targetCommodity = commodities?.find((c) => c.id === targetGrn.commodityId);
  const { seasonalRates, monthlyRates } = resolveTransferRates(targetGrn, targetCommodity);
  const effectiveRates = targetGrn.rentType === 'Monthly' ? monthlyRates : seasonalRates;
  const targetSmallRate = effectiveRates.small;
  const targetBigRate = effectiveRates.big;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.reviewGrid}>
        <MergeStep4RepackSection
          destinationChamber={destinationChamber}
          onDestinationChamberChange={onDestinationChamberChange}
          partyMark={partyMark}
          onPartyMarkChange={onPartyMarkChange}
          storageMark={storageMark}
          onStorageMarkChange={onStorageMarkChange}
          repackMode={repackMode}
          onRepackModeChange={onRepackModeChange}
          repackBagType={repackBagType}
          onRepackBagTypeChange={onRepackBagTypeChange}
          repackSmall={repackSmall}
          onRepackSmallChange={onRepackSmallChange}
          repackBig={repackBig}
          onRepackBigChange={onRepackBigChange}
          repackQuantity={repackQuantity}
          onRepackQuantityChange={onRepackQuantityChange}
          repackSeasonalBagPrice={repackSeasonalBagPrice}
          onRepackSeasonalBagPriceChange={onRepackSeasonalBagPriceChange}
          repackMonthlyBagPrice={repackMonthlyBagPrice}
          onRepackMonthlyBagPriceChange={onRepackMonthlyBagPriceChange}
          repackBagPrice={repackBagPrice}
          onRepackBagPriceChange={onRepackBagPriceChange}
          totalSourceBags={totalSourceBags}
          totalConsolidatedBags={totalConsolidatedBags}
          referenceWeight={referenceWeight}
          onReferenceWeightChange={onReferenceWeightChange}
          repackHamaliCharge={repackHamaliCharge}
          actualRepackedBags={actualRepackedBags}
          commodityHamaliRate={commodityHamaliRate}
          movementDate={movementDate}
          targetSmallRate={targetSmallRate}
          targetBigRate={targetBigRate}
          submitting={submitting}
          targetGrnRentType={targetGrn.rentType}
          targetGrnDate={targetGrn.date}
        />

        <div className={styles.compactCard}>
          <div className={styles.formSection}>
            <label htmlFor="merge-reason" className={styles.inputLabel}>Audit Reason (min 5 chars) *</label>
            <Input id="merge-reason" placeholder="e.g. Stock consolidation / Re-bagging lot" value={reason} onChange={(e) => onReasonChange(e.target.value)} disabled={submitting} required />
          </div>

          <div className={styles.formSection}>
            <label htmlFor="merge-remarks" className={styles.inputLabel}>Additional Remarks (Optional)</label>
            <textarea id="merge-remarks" aria-label="Additional Remarks" rows={2} className={styles.textarea} placeholder="Notes or remarks..." value={remarks} onChange={(e) => onRemarksChange(e.target.value)} disabled={submitting} />
          </div>

          <div className={styles.noticeBox}>
            All {selectedSourcesCount} source GRN{selectedSourcesCount > 1 ? 's' : ''} will be permanently closed. Stock and obligations will reside on surviving GRN {targetGrn.grnNumber}.
          </div>
        </div>
      </div>

      <WizardStepActions onBack={onBack} backLabel="Back to Settlement" isSubmitStep submitLabel="Execute Merge & Repack" submitting={submitting} />
    </div>
  );
}
