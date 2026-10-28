'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  calculateHamaliAmount, resolveMergedBagType,
  seasonYearForInwardDate,
  type Commodity, type Grn, type OutwardBagCategory, type PaymentMode,
  type RentSummaryDto, type TransferPaymentDecision,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { DEFAULT_BAG_CONFIRMATION, deriveAutoInheritedBagComposition, type BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeGrandTotal } from './mergeRentAssessment.helper';
import {
  filterEligibleTargetGrns, findForwardMergeTarget, partitionMergeSources,
  resolveInitialMergeState, resolveNextSelectedSources,
} from './mergeEligibility.helper';
import { validateMergePaymentDecision } from './internalMovementPayload.helper';
import {
  deriveMovedAndTargetBags,
  deriveRepackCompositionStatus,
} from './mergeRepackComposition.helper';
import { buildMergeExecutionPayload } from './mergeExecutionPayload.helper';
import {
  validateMergeSubmit,
  validateStep2Proceed,
  validateStep3Proceed,
} from './mergeStepValidation.helper';
import { useMergeRepackForm } from './useMergeRepackForm';

export interface UseInternalMovementMergeTabProps {
  currentGrn: Grn; facilityId?: string; allGrns: Grn[]; commodities?: Commodity[]; submitting: boolean; initiatingGrnId?: string;
  onExecuteMerge: (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string, movementDate?: string,
    additionalRentAmount?: number, repackedSmallBags?: number, repackedBigBags?: number, referenceWeight?: number,
    sourcePaymentAmount?: number, sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number, sourceMonthlyBagPrice?: number,
    isRepackSelected?: boolean, repackedBagCount?: number,
  ) => Promise<void>;
}

export function useInternalMovementMergeTab({
  currentGrn, facilityId, allGrns, commodities, onExecuteMerge, initiatingGrnId,
}: UseInternalMovementMergeTabProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const [targetGrnId, setTargetGrnId] = useState<string>(() => resolveInitialMergeState(currentGrn, allGrns.filter((g) => g.status === 'OPEN'), initiatingGrnId).initialTargetId);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() => resolveInitialMergeState(currentGrn, allGrns.filter((g) => g.status === 'OPEN'), initiatingGrnId).initialSourceIds);
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(''); const [remarks, setRemarks] = useState('');
  const [confirmation, setConfirmation] = useState<BagConfirmationValue>(DEFAULT_BAG_CONFIRMATION);
  const [sourceConfirmations, setSourceConfirmations] = useState<Record<string, BagConfirmationValue>>({});
  const updateSourceConfirmation = (grnId: string, patch: Partial<BagConfirmationValue>) => {
    setSourceConfirmations((prev) => ({ ...prev, [grnId]: { ...(prev[grnId] ?? DEFAULT_BAG_CONFIRMATION), ...patch } }));
  };
  const [settlementDecision, setSettlementDecision] = useState<TransferPaymentDecision>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0); const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const repack = useMergeRepackForm();
  const {
    repackMode, repackBagType, repackSmall, repackBig, repackQuantity,
    repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice, referenceWeight,
  } = repack;
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sourceRentSummaries, setSourceRentSummaries] = useState<Record<string, RentSummaryDto>>({});

  const targetGrn = useMemo(() => openGrns.find((g) => g.id === targetGrnId) ?? currentGrn, [openGrns, targetGrnId, currentGrn]);
  const targetSeason = useMemo(() => seasonYearForInwardDate(targetGrn.date), [targetGrn.date]);
  const { eligibleSources, futureSeasonCount } = useMemo(
    () => partitionMergeSources(openGrns, targetGrnId, targetSeason, targetGrn.commodityId, targetGrn.rentType),
    [openGrns, targetGrnId, targetSeason, targetGrn.commodityId, targetGrn.rentType],
  );
  const recommendedSwitchGrn = useMemo(
    () => (futureSeasonCount > 0 ? findForwardMergeTarget(targetGrn, openGrns) : null),
    [futureSeasonCount, targetGrn, openGrns],
  );
  const handleTargetChange = (newTargetId: string) => {
    setTargetGrnId(newTargetId);
    setSelectedSourceIds((prev) => resolveNextSelectedSources(initiatingGrnId, newTargetId, prev, openGrns));
  };
  const targetOptions = useMemo(
    () => filterEligibleTargetGrns(openGrns, targetGrn, selectedSourceIds, targetGrnId, initiatingGrnId),
    [openGrns, targetGrn, selectedSourceIds, targetGrnId, initiatingGrnId],
  );
  const handleToggleSource = (id: string) => {
    if (initiatingGrnId && id === initiatingGrnId && targetGrnId !== initiatingGrnId) return;
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };
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
          .then((dto: RentSummaryDto | null) => { if (dto) setSourceRentSummaries((prev) => ({ ...prev, [source.id]: dto })); })
          .catch(() => {});
      }
    }
  }, [facilityId, currentGrn.facilityId, selectedSources, sourceRentSummaries]);

  const targetCommodity = useMemo(() => commodities?.find((c) => c.id === targetGrn.commodityId), [commodities, targetGrn.commodityId]);
  const commodityHamaliRate = useMemo(() => {
    if (!targetCommodity) return 0;
    return (targetCommodity.isHamaliApplicable ?? (targetCommodity.hamaliRate ?? 0) > 0) ? (targetCommodity.hamaliRate ?? 0) : 0;
  }, [targetCommodity]);

  const totalSourcePendingRent = useMemo(() => calculateMergeGrandTotal({
    selectedSources,
    sourceConfirmations,
    movementDate,
    commodityHamaliRate,
    targetGrnDate: targetGrn.date,
    sourceRentSummaries,
  }), [selectedSources, sourceConfirmations, movementDate, commodityHamaliRate, targetGrn.date, sourceRentSummaries]);

  useEffect(() => {
    if (totalSourcePendingRent > 0 && settleAmount === 0) setSettleAmount(totalSourcePendingRent);
  }, [totalSourcePendingRent, settleAmount]);

  const { isTargetDiff, isRepackRequired, isRepackFilled, actualRepackedBags } =
    deriveRepackCompositionStatus({ targetGrn, selectedSources, repackMode, repackBagType, repackQuantity, repackSmall, repackBig });

  const repackHamaliCharge = useMemo(
    () => (repackMode && actualRepackedBags > 0 && commodityHamaliRate > 0 ? calculateHamaliAmount(actualRepackedBags, commodityHamaliRate) : 0),
    [repackMode, actualRepackedBags, commodityHamaliRate],
  );

  const { movedSmall, movedBig, addedBagsToTarget, targetNewRemaining, effectiveIsHybrid } =
    deriveMovedAndTargetBags({ selectedSources, sourceConfirmations, repackMode, repackBagType, isRepackFilled, repackSmall, repackBig, repackQuantity, totalSourceBags, targetCurrentRemaining, targetBagType: targetGrn.bagType, actualRepackedBags });

  const resultingBagType = useMemo(() => resolveMergedBagType({
    targetBagType: targetGrn.bagType,
    sourceBagTypes: effectiveIsHybrid ? ['Hybrid'] : selectedSources.map((s) => s.bagType),
    newSmallBags: (targetGrn.smallBags ?? 0) + movedSmall,
    newBigBags: (targetGrn.bigBags ?? 0) + movedBig,
  }), [targetGrn.bagType, targetGrn.smallBags, targetGrn.bigBags, selectedSources, movedSmall, movedBig, effectiveIsHybrid]);

  const handleProceedToStep2 = () => {
    setValidationError(null);
    const err = validateStep2Proceed({ targetGrnId, isTargetLoanHold, targetGrnNumber: targetGrn.grnNumber, targetCurrentRemaining, selectedSourceIds });
    if (err) return setValidationError(err);

    const initialConfirmations: Record<string, BagConfirmationValue> = {};
    for (const s of selectedSources) initialConfirmations[s.id] = deriveAutoInheritedBagComposition([s], s.closingBags ?? s.bags);
    setSourceConfirmations(initialConfirmations);
    const derived = initialConfirmations[selectedSources[0]?.id] ?? deriveAutoInheritedBagComposition(selectedSources, totalSourceBags);
    setConfirmation(derived);
    repack.applyDerivedRepackDefaults(derived, totalSourceBags);
    if (selectedSourceIds.length > 1) setSettlementDecision('AGREED_PENDING');
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    const err = validateStep3Proceed({ selectedSources, sourceConfirmations });
    if (err) return setValidationError(err);
    setSettleAmount(totalSourcePendingRent);
    setStep(3);
  };

  const handleProceedToStep4 = () => {
    setValidationError(null);
    const err = validateMergePaymentDecision({ decision: settlementDecision, sourceCount: selectedSources.length, amount: settleAmount, pending: totalSourcePendingRent, paymentMode });
    if (err) return setValidationError(err);
    setStep(4);
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const err = validateMergeSubmit({ selectedSourceIds, reason, isTargetLoanHold, targetGrnNumber: targetGrn.grnNumber, repackMode, repackBagType, isRepackFilled, repackSmall, repackBig, repackQuantity, repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice });
    if (err) return setValidationError(err);

    const primaryConf = sourceConfirmations[selectedSources[0]?.id] ?? confirmation;
    const { effSmall, effBig, effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, effRepackedBagCount, resolvedCategory } =
      buildMergeExecutionPayload({ repackMode, repackBagType, repackSmall, repackBig, repackQuantity, repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice, isRepackFilled, isRepackRequired, movedSmall, movedBig, totalSourceBags, primaryConf });
    const isSettleNow = settlementDecision === 'SETTLE_NOW' && settleAmount > 0;

    await onExecuteMerge(
      targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, effSmall, effBig,
      typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      isSettleNow ? settleAmount : undefined, isSettleNow ? paymentMode : undefined,
      resolvedCategory,
      effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, repackMode, effRepackedBagCount,
    );
  };

  return {
    step, setStep, targetGrnId, setTargetGrnId, selectedSourceIds, setSelectedSourceIds,
    movementDate, reason, setReason, remarks, setRemarks, confirmation, setConfirmation,
    sourceConfirmations, setSourceConfirmations, updateSourceConfirmation, sourceRentSummaries,
    settlementDecision, setSettlementDecision, settleAmount, setSettleAmount, paymentMode, setPaymentMode,
    ...repack, validationError, openGrns, targetGrn, targetSeason,
    eligibleSources, futureSeasonCount, recommendedSwitchGrn, targetOptions, handleTargetChange, handleToggleSource, handleSwitchTarget: handleTargetChange,
    selectedSources, totalSourceBags, targetCurrentRemaining, isTargetLoanHold,
    totalSourcePendingRent, isTargetDiff, isRepackFilled, commodityHamaliRate, actualRepackedBags,
    repackHamaliCharge, movedSmall, movedBig, addedBagsToTarget, targetNewRemaining,
    resultingBagType, handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleMergeSubmit,
  };
}
