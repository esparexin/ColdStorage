'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateHamaliAmount, isHybridBagCategory, resolveMergedBagType,
  resolveStoredCompositionVerified, seasonYearForInwardDate,
  type Commodity, type Grn, type OutwardBagCategory, type PaymentMode,
  type RentSummaryDto, type TransferPaymentDecision,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { DEFAULT_BAG_CONFIRMATION, type BagConfirmationValue } from './MergeBagCategoryFields';
import { partitionMergeSources } from './mergeEligibility.helper';
import { previewConfirmedSplit, validateBagConfirmation } from './bagConfirmation.helper';
import { WizardStepper } from './WizardStepper';
import { MergeStep1Batches } from './MergeStep1Batches';
import { MergeStep2BagType } from './MergeStep2BagType';
import { MergeStep3Settlement } from './MergeStep3Settlement';
import { MergeStep4RepackConfirm } from './MergeStep4RepackConfirm';
import styles from './InternalMovementModal.module.css';

const MERGE_STEPS = [
  { number: 1, label: '1. Batches & Surviving GRN' }, { number: 2, label: '2. Bag Type & History' },
  { number: 3, label: '3. Rent Settlement' }, { number: 4, label: '4. Repack & Confirm' },
];

interface InternalMovementMergeTabProps {
  currentGrn: Grn;
  facilityId?: string;
  allGrns: Grn[];
  commodities?: Commodity[];
  submitting: boolean;
  onExecuteMerge: (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number, isRepackSelected?: boolean, repackedBagCount?: number,
  ) => Promise<void>;
}

export function InternalMovementMergeTab({
  currentGrn, facilityId, allGrns, commodities, submitting, onExecuteMerge,
}: InternalMovementMergeTabProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [targetGrnId, setTargetGrnId] = useState<string>(currentGrn.id);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmation, setConfirmation] = useState<BagConfirmationValue>(DEFAULT_BAG_CONFIRMATION);
  const [settlementDecision, setSettlementDecision] = useState<TransferPaymentDecision>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [repackMode, setRepackMode] = useState(false);
  const [repackSmall, setRepackSmall] = useState<number | ''>('');
  const [repackBig, setRepackBig] = useState<number | ''>('');
  const [referenceWeight, setReferenceWeight] = useState<number | ''>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sourceRentSummaries, setSourceRentSummaries] = useState<Record<string, RentSummaryDto>>({});

  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const targetSeason = useMemo(() => seasonYearForInwardDate(targetGrn.date), [targetGrn.date]);
  const { eligibleSources, futureSeasonCount } = useMemo(
    () => partitionMergeSources(openGrns, targetGrnId, targetSeason, targetGrn.commodityId, targetGrn.rentType),
    [openGrns, targetGrnId, targetSeason, targetGrn.commodityId, targetGrn.rentType],
  );
  const selectedSources = useMemo(() => eligibleSources.filter((g) => selectedSourceIds.includes(g.id)), [eligibleSources, selectedSourceIds]);
  const totalSourceBags = useMemo(() => selectedSources.reduce((acc, g) => acc + (g.closingBags ?? g.bags), 0), [selectedSources]);
  const targetCurrentRemaining = targetGrn.closingBags ?? targetGrn.bags;
  const isTargetLoanHold = targetGrn.loanStatus === 'TAKEN';

  useEffect(() => {
    const effectiveFacilityId = facilityId ?? currentGrn.facilityId;
    if (!effectiveFacilityId || selectedSources.length === 0) return;
    for (const source of selectedSources) {
      if (!sourceRentSummaries[source.id]) {
        requestWithAuth(`/api/facilities/${encodeURIComponent(effectiveFacilityId)}/rent/grn/${encodeURIComponent(source.id)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((dto: RentSummaryDto | null) => {
            if (dto) setSourceRentSummaries((prev) => ({ ...prev, [source.id]: dto }));
          }).catch(() => {});
      }
    }
  }, [facilityId, currentGrn.facilityId, selectedSources, sourceRentSummaries]);

  const totalSourcePendingRent = useMemo(() => selectedSources.reduce((acc, s) => {
    const summary = sourceRentSummaries[s.id];
    const remaining = summary ? summary.remainingBalance : (s.rentRemainingBalance ?? s.rentAmount ?? 0);
    return acc + (remaining > 0 ? remaining : 0);
  }, 0), [selectedSources, sourceRentSummaries]);

  useEffect(() => {
    if (totalSourcePendingRent > 0 && settleAmount === 0) setSettleAmount(totalSourcePendingRent);
  }, [totalSourcePendingRent, settleAmount]);

  const isTargetDiff = (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) && targetGrn.smallBagPrice !== targetGrn.bigBagPrice;
  const isTargetVerified = resolveStoredCompositionVerified({ isCompositionVerified: targetGrn.isCompositionVerified, bagType: targetGrn.bagType, bags: targetGrn.bags, smallBags: targetGrn.smallBags, bigBags: targetGrn.bigBags });
  const allSourcesVerified = selectedSources.every((s) => resolveStoredCompositionVerified({ isCompositionVerified: s.isCompositionVerified, bagType: s.bagType, bags: s.bags, smallBags: s.smallBags, bigBags: s.bigBags }));
  const isRepackRequired = repackMode || (selectedSources.length > 0 && (isTargetDiff || selectedSources.some((s) => (s.smallBagPrice != null || s.bigBagPrice != null) && s.smallBagPrice !== s.bigBagPrice)) && (!isTargetVerified || !allSourcesVerified));
  const isRepackFilled = typeof repackSmall === 'number' && typeof repackBig === 'number' && Number.isInteger(repackSmall) && Number.isInteger(repackBig);

  const targetCommodity = useMemo(() => commodities?.find((c) => c.id === targetGrn.commodityId), [commodities, targetGrn.commodityId]);
  const commodityHamaliRate = useMemo(() => {
    if (!targetCommodity) return 0;
    return (targetCommodity.isHamaliApplicable ?? (targetCommodity.hamaliRate ?? 0) > 0) ? (targetCommodity.hamaliRate ?? 0) : 0;
  }, [targetCommodity]);

  const actualRepackedBags = repackMode && isRepackFilled ? Number(repackSmall) + Number(repackBig) : 0;
  const repackHamaliCharge = useMemo(() => (repackMode && actualRepackedBags > 0 && commodityHamaliRate > 0 ? calculateHamaliAmount(actualRepackedBags, commodityHamaliRate) : 0), [repackMode, actualRepackedBags, commodityHamaliRate]);

  const rawSmall = selectedSources.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
  const rawBig = selectedSources.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
  const scale = totalSourceBags > 0 && rawSmall + rawBig > 0 && rawSmall + rawBig !== totalSourceBags ? totalSourceBags / (rawSmall + rawBig) : 1;
  const defSmall = scale === 1 ? rawSmall : Math.round(rawSmall * scale);
  const previewSplit = previewConfirmedSplit({
    category: confirmation.category, rawSmall, rawBig, total: totalSourceBags,
    defaultSmall: defSmall, defaultBig: totalSourceBags - defSmall, repackSmall, repackBig, isRepackFilled,
    confirmedSmall: confirmation.smallBags, confirmedBig: confirmation.bigBags,
  });
  const movedSmall = repackMode && isRepackFilled ? Number(repackSmall) : previewSplit.small;
  const movedBig = repackMode && isRepackFilled ? Number(repackBig) : previewSplit.big;
  const addedBagsToTarget = repackMode ? (isRepackFilled ? (Number(repackSmall) + Number(repackBig)) : 0) : totalSourceBags;
  const targetNewRemaining = targetCurrentRemaining + addedBagsToTarget;

  const resultingBagType = useMemo(() => resolveMergedBagType({
    targetBagType: targetGrn.bagType, sourceBagTypes: selectedSources.map((s) => s.bagType),
    newSmallBags: (targetGrn.smallBags ?? 0) + movedSmall, newBigBags: (targetGrn.bigBags ?? 0) + movedBig,
  }), [targetGrn.bagType, targetGrn.smallBags, targetGrn.bigBags, selectedSources, movedSmall, movedBig]);

  const handleProceedToStep2 = () => {
    setValidationError(null);
    if (!targetGrnId) return setValidationError('Please select the surviving target GRN.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
    if (targetCurrentRemaining <= 0) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has zero remaining stock.`);
    if (selectedSourceIds.length === 0) return setValidationError('Please select at least one source GRN to merge.');
    const first = selectedSources[0];
    const isFirstVer = first ? resolveStoredCompositionVerified(first) : false;
    const isBig = isFirstVer && (first?.bagType === 'B' || (first?.bigBags ?? 0) === totalSourceBags);
    const isSmall = isFirstVer && (first?.bagType === 'S' || (first?.smallBags ?? 0) === totalSourceBags);
    const sRate = isBig ? (first?.bigBagPrice ?? 15) : (isSmall ? (first?.smallBagPrice ?? 10) : '');
    setConfirmation((p) => ({
      ...p, category: 'S/B', quantity: totalSourceBags,
      smallBags: isSmall ? totalSourceBags : (isBig ? 0 : ''), bigBags: isBig ? totalSourceBags : (isSmall ? 0 : ''),
      confirmedSmallBags: isSmall ? totalSourceBags : (isBig ? 0 : ''), confirmedBigBags: isBig ? totalSourceBags : (isSmall ? 0 : ''),
      seasonalBagPrice: sRate, bagPrice: sRate,
    }));
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    if (!isHybridBagCategory(confirmation.category) && typeof confirmation.smallBags !== 'number' && typeof confirmation.bigBags !== 'number') {
      return setValidationError('Please confirm whether the moved bags are Small or Big before proceeding.');
    }
    const confirmedQty = isHybridBagCategory(confirmation.category) ? totalSourceBags : confirmation.quantity;
    const confirmError = validateBagConfirmation({
      category: confirmation.category, quantity: confirmedQty, bagPrice: confirmation.bagPrice,
      seasonalBagPrice: confirmation.seasonalBagPrice, monthlyBagPrice: confirmation.monthlyBagPrice,
      smallBags: confirmation.smallBags, bigBags: confirmation.bigBags,
      repackSmall: '', repackBig: '', totalMovedBags: totalSourceBags, isRepackRequired: false,
    });
    if (confirmError) return setValidationError(confirmError);
    setStep(3);
  };

  const handleProceedToStep4 = () => {
    setValidationError(null);
    if (settlementDecision === 'SETTLE_NOW') {
      if (typeof settleAmount !== 'number' || settleAmount <= 0) return setValidationError('Enter a settlement amount greater than zero.');
      if (settleAmount > totalSourcePendingRent) return setValidationError(`Settlement amount cannot exceed outstanding rent of ₹${totalSourcePendingRent}.`);
      if (!paymentMode) return setValidationError('Please select a payment mode.');
    }
    setStep(4);
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
    if (repackMode && !isRepackFilled) return setValidationError('Both Repacked Small and Big bag counts are required.');
    if (repackMode && (Number(repackSmall) < 0 || Number(repackBig) < 0)) return setValidationError('Repacked bag counts cannot be negative.');
    const isSb = confirmation.category === 'S/B' || confirmation.category === 'Small & Big';
    const effSmall = isRepackFilled ? Number(repackSmall) : (typeof confirmation.smallBags === 'number' ? confirmation.smallBags : undefined);
    const effBig = isRepackFilled ? Number(repackBig) : (typeof confirmation.bigBags === 'number' ? confirmation.bigBags : undefined);
    await onExecuteMerge(
      targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, effSmall, effBig,
      typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      settlementDecision === 'SETTLE_NOW' && settleAmount > 0 ? settleAmount : undefined,
      settlementDecision === 'SETTLE_NOW' && settleAmount > 0 ? paymentMode : undefined,
      (!isSb || isRepackRequired || isRepackFilled || typeof confirmation.smallBags === 'number') ? confirmation.category : undefined,
      isHybridBagCategory(confirmation.category) ? totalSourceBags : (typeof confirmation.quantity === 'number' ? confirmation.quantity : undefined),
      typeof confirmation.bagPrice === 'number' ? confirmation.bagPrice : undefined,
      typeof confirmation.seasonalBagPrice === 'number' ? confirmation.seasonalBagPrice : undefined,
      typeof confirmation.monthlyBagPrice === 'number' ? confirmation.monthlyBagPrice : undefined,
      repackMode, repackMode && isRepackFilled ? (Number(repackSmall) + Number(repackBig)) : undefined,
    );
  };

  return (
    <form id="merge-grn-form" onSubmit={handleMergeSubmit} className={styles.modalContent}>
      {validationError && (
        <div role="alert" className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}
      <WizardStepper steps={MERGE_STEPS} currentStep={step} onStepClick={(s) => setStep(s as 1 | 2 | 3 | 4)} canNavigateToStep={(s) => (s === 1 || selectedSourceIds.length > 0)} disabled={submitting} />
      {step === 1 && (
        <MergeStep1Batches
          openGrns={openGrns} targetGrnId={targetGrnId} onTargetGrnChange={(id) => { setTargetGrnId(id); setSelectedSourceIds((p) => p.filter((i) => i !== id)); }}
          targetGrn={targetGrn} targetSeason={targetSeason} targetCurrentRemaining={targetCurrentRemaining} isTargetHybrid={(!isTargetDiff && targetGrn.bagPrice != null) || isHybridBagCategory(targetGrn.bagType)}
          eligibleSources={eligibleSources} selectedSourceIds={selectedSourceIds} selectedSources={selectedSources} totalSourceBags={totalSourceBags}
          futureSeasonCount={futureSeasonCount} submitting={submitting} onToggleSource={(id) => setSelectedSourceIds((p) => (p.includes(id) ? p.filter((i) => i !== id) : [...p, id]))} onNext={handleProceedToStep2}
        />
      )}
      {step === 2 && (
        <MergeStep2BagType
          confirmation={confirmation} onConfirmationChange={(patch) => setConfirmation((p) => ({ ...p, ...patch }))}
          totalSourceBags={totalSourceBags} confirmSource={selectedSources[0] ?? targetGrn} movementDate={movementDate}
          facilityId={facilityId ?? currentGrn.facilityId} selectedSources={selectedSources} movedSmall={movedSmall} movedBig={movedBig}
          commodityHamaliRate={commodityHamaliRate} targetGrnDate={targetGrn.date} submitting={submitting} onBack={() => setStep(1)} onNext={handleProceedToStep3}
        />
      )}
      {step === 3 && (
        <MergeStep3Settlement
          totalSourcePendingRent={totalSourcePendingRent} settlementDecision={settlementDecision} onSettlementDecisionChange={setSettlementDecision}
          settleAmount={settleAmount} onSettleAmountChange={setSettleAmount} paymentMode={paymentMode} onPaymentModeChange={setPaymentMode}
          targetGrnNumber={targetGrn.grnNumber} submitting={submitting} onBack={() => setStep(2)} onNext={handleProceedToStep4}
        />
      )}
      {step === 4 && (
        <MergeStep4RepackConfirm
          repackMode={repackMode} onRepackModeChange={(act) => { setRepackMode(act); if (!act) { setRepackSmall(''); setRepackBig(''); setReferenceWeight(''); } }}
          repackSmall={repackSmall} onRepackSmallChange={setRepackSmall} repackBig={repackBig} onRepackBigChange={setRepackBig}
          referenceWeight={referenceWeight} onReferenceWeightChange={setReferenceWeight} repackHamaliCharge={repackHamaliCharge}
          actualRepackedBags={actualRepackedBags} commodityHamaliRate={commodityHamaliRate} movementDate={movementDate}
          targetGrn={targetGrn} targetCurrentRemaining={targetCurrentRemaining} addedBagsToTarget={addedBagsToTarget}
          isRepackFilled={isRepackFilled} targetNewRemaining={targetNewRemaining} confirmationCategory={confirmation.category}
          resultingBagType={resultingBagType} settlementDecision={settlementDecision} settleAmount={settleAmount}
          totalSourcePendingRent={totalSourcePendingRent} reason={reason} onReasonChange={setReason} remarks={remarks}
          onRemarksChange={setRemarks} selectedSourcesCount={selectedSources.length} movedSmall={movedSmall} movedBig={movedBig}
          submitting={submitting} onBack={() => setStep(3)}
        />
      )}
    </form>
  );
}
