'use client';

import React, { useState } from 'react';
import { isHybridBagCategory, type Commodity, type Grn, type OutwardBagCategory, type PaymentMode } from '@cold-storage/contracts';
import { ConfirmDialog } from '@/components/ui';
import { WizardStepper } from './WizardStepper';
import { MergeStep1Batches } from './MergeStep1Batches';
import { MergeStep2BagType } from './MergeStep2BagType';
import { MergeStep3Settlement } from './MergeStep3Settlement';
import { MergeStep4RepackConfirm } from './MergeStep4RepackConfirm';
import { MergeConfirmSummary } from './MergeConfirmSummary';
import { useInternalMovementMergeTab } from './useInternalMovementMergeTab';
import styles from './InternalMovementModal.module.css';

const MERGE_STEPS = [
  { number: 1, label: '1. Batches & Target GRN' },
  { number: 2, label: '2. Bag Type & History' },
  { number: 3, label: '3. Rent Settlement' },
  { number: 4, label: '4. Repack & Confirm' },
];

interface InternalMovementMergeTabProps {
  currentGrn: Grn;
  facilityId?: string;
  allGrns: Grn[];
  commodities?: Commodity[];
  submitting: boolean;
  initiatingGrnId?: string;
  onExecuteMerge: (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number, isRepackSelected?: boolean, repackedBagCount?: number,
    destinationChamber?: string,
  ) => Promise<void>;
}

export function InternalMovementMergeTab(props: InternalMovementMergeTabProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { currentGrn, facilityId, submitting, initiatingGrnId } = props;
  const {
    step, setStep, targetGrnId, selectedSourceIds,
    movementDate, reason, setReason, remarks, setRemarks, confirmation,
    sourceConfirmations, updateSourceConfirmation, sourceRentSummaries,
    settlementDecision, settleAmount,
    destinationChamber, setDestinationChamber,
    repackMode, setRepackMode, repackBagType, setRepackBagType,
    repackSmall, setRepackSmall, repackBig, setRepackBig, repackQuantity, setRepackQuantity,
    repackSeasonalBagPrice, setRepackSeasonalBagPrice, repackMonthlyBagPrice, setRepackMonthlyBagPrice,
    repackBagPrice, setRepackBagPrice, referenceWeight, setReferenceWeight, validationError,
    openGrns, targetGrn, targetSeason, eligibleSources, futureSeasonCount, recommendedSwitchGrn,
    targetOptions, handleTargetChange, handleToggleSource, handleSwitchTarget,
    selectedSources, totalSourceBags, targetCurrentRemaining,
    totalSourcePendingRent, isTargetDiff, isRepackFilled, commodityHamaliRate, actualRepackedBags,
    repackHamaliCharge, movedSmall, movedBig, addedBagsToTarget, targetNewRemaining,
    resultingBagType, handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleMergeSubmit,
  } = useInternalMovementMergeTab(props);

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 4) {
      if (reason.trim().length < 5) {
        void handleMergeSubmit(e);
        return;
      }
      setShowConfirm(true);
    }
  };

  return (
    <form id="merge-grn-form" onSubmit={onFormSubmit} className={styles.modalContent}>
      {validationError && (
        <div role="alert" className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}
      <WizardStepper steps={MERGE_STEPS} currentStep={step} onStepClick={(s) => setStep(s as 1 | 2 | 3 | 4)} canNavigateToStep={(s) => (s === 1 || selectedSourceIds.length > 0)} disabled={submitting} />

      {step === 1 && (
        <MergeStep1Batches
          openGrns={openGrns} targetOptions={targetOptions} targetGrnId={targetGrnId} onTargetGrnChange={handleTargetChange}
          targetGrn={targetGrn} targetSeason={targetSeason} targetCurrentRemaining={targetCurrentRemaining} isTargetHybrid={(!isTargetDiff && targetGrn.bagPrice != null) || isHybridBagCategory(targetGrn.bagType)}
          eligibleSources={eligibleSources} selectedSourceIds={selectedSourceIds} selectedSources={selectedSources} totalSourceBags={totalSourceBags}
          futureSeasonCount={futureSeasonCount} recommendedSwitchGrn={recommendedSwitchGrn} onSwitchTarget={handleSwitchTarget}
          submitting={submitting} onToggleSource={handleToggleSource} onNext={handleProceedToStep2} initiatingGrnId={initiatingGrnId}
        />
      )}
      {step === 2 && (
        <MergeStep2BagType
          sourceConfirmations={sourceConfirmations}
          onSourceConfirmationChange={updateSourceConfirmation}
          totalSourceBags={totalSourceBags}
          movementDate={movementDate}
          facilityId={facilityId ?? currentGrn.facilityId}
          selectedSources={selectedSources}
          commodityHamaliRate={commodityHamaliRate}
          targetGrn={targetGrn}
          targetSeason={targetSeason}
          targetCurrentRemaining={targetCurrentRemaining}
          isTargetHybrid={(!isTargetDiff && targetGrn.bagPrice != null) || isHybridBagCategory(targetGrn.bagType)}
          targetGrnDate={targetGrn.date}
          commodities={props.commodities}
          submitting={submitting}
          onBack={() => setStep(1)}
          onNext={handleProceedToStep3}
          sourceRentSummaries={sourceRentSummaries}
        />
      )}
      {step === 3 && (
        <MergeStep3Settlement
          totalSourcePendingRent={totalSourcePendingRent}
          targetGrn={targetGrn}
          selectedSources={selectedSources}
          sourceConfirmations={sourceConfirmations}
          sourceRentSummaries={sourceRentSummaries}
          movementDate={movementDate}
          commodities={props.commodities}
          commodityHamaliRate={commodityHamaliRate}
          submitting={submitting}
          onBack={() => setStep(2)}
          onNext={handleProceedToStep4}
        />
      )}
      {step === 4 && (
        <MergeStep4RepackConfirm
          destinationChamber={destinationChamber || targetGrn.chamber || ''}
          onDestinationChamberChange={setDestinationChamber}
          repackMode={repackMode}
          onRepackModeChange={(act) => {
            setRepackMode(act);
            if (!act) {
              setRepackSmall('');
              setRepackBig('');
              setRepackQuantity(totalSourceBags);
              setReferenceWeight('');
            }
          }}
          repackBagType={repackBagType}
          onRepackBagTypeChange={setRepackBagType}
          repackSmall={repackSmall}
          onRepackSmallChange={setRepackSmall}
          repackBig={repackBig}
          onRepackBigChange={setRepackBig}
          repackQuantity={repackQuantity}
          onRepackQuantityChange={setRepackQuantity}
          repackSeasonalBagPrice={repackSeasonalBagPrice}
          onRepackSeasonalBagPriceChange={setRepackSeasonalBagPrice}
          repackMonthlyBagPrice={repackMonthlyBagPrice}
          onRepackMonthlyBagPriceChange={setRepackMonthlyBagPrice}
          repackBagPrice={repackBagPrice}
          onRepackBagPriceChange={setRepackBagPrice}
          totalSourceBags={totalSourceBags}
          referenceWeight={referenceWeight}
          onReferenceWeightChange={setReferenceWeight}
          repackHamaliCharge={repackHamaliCharge}
          actualRepackedBags={actualRepackedBags}
          commodityHamaliRate={commodityHamaliRate}
          movementDate={movementDate}
          targetGrn={targetGrn}
          targetCurrentRemaining={targetCurrentRemaining}
          addedBagsToTarget={addedBagsToTarget}
          isRepackFilled={isRepackFilled}
          targetNewRemaining={targetNewRemaining}
          confirmationCategory={confirmation.category}
          resultingBagType={resultingBagType}
          settlementDecision={settlementDecision}
          settleAmount={settleAmount}
          totalSourcePendingRent={totalSourcePendingRent}
          reason={reason}
          onReasonChange={setReason}
          remarks={remarks}
          onRemarksChange={setRemarks}
          selectedSourcesCount={selectedSources.length}
          movedSmall={movedSmall}
          movedBig={movedBig}
          submitting={submitting}
          onBack={() => setStep(3)}
        />
      )}
      {showConfirm && (
        <ConfirmDialog
          isOpen={showConfirm}
          title="Confirm GRN Merge & Repacking"
          size="md"
          message={
            <MergeConfirmSummary
              targetGrnNumber={targetGrn.grnNumber}
              targetCustomerName={targetGrn.customerName}
              sourceGrnNumbers={selectedSources.map((s) => s.grnNumber)}
              totalSourceBags={totalSourceBags}
              resultingBagType={resultingBagType}
              repackMode={repackMode}
              actualRepackedBags={actualRepackedBags}
              repackSmall={repackSmall}
              repackBig={repackBig}
              repackBagType={repackBagType}
              commodityHamaliRate={commodityHamaliRate}
              repackHamaliCharge={repackHamaliCharge}
              settlementDecision={settlementDecision}
              settleAmount={settleAmount}
              totalSourcePendingRent={totalSourcePendingRent}
            />
          }
          confirmLabel="Yes, Execute Merge"
          confirmVariant="primary"
          isBusy={submitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={async () => {
            setShowConfirm(false);
            await handleMergeSubmit({ preventDefault: () => {} } as React.FormEvent);
          }}
        />
      )}
    </form>
  );
}
