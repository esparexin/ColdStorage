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
import { calculateMergeSettlementBill } from './mergeRentAssessment.helper';
import {
  filterEligibleTargetGrns, findForwardMergeTarget, partitionMergeSources,
  resolveInitialMergeState, resolveNextSelectedSources,
} from './mergeEligibility.helper';
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
    isRepackSelected?: boolean, repackedBagCount?: number, destinationChamber?: string,
    targetSmallBags?: number, targetBigBags?: number, targetBagCategory?: OutwardBagCategory,
    targetQuantity?: number, targetBagPrice?: number, targetSeasonalBagPrice?: number,
    targetMonthlyBagPrice?: number,
    partyMark?: string, storageMark?: string,
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
  const [targetConfirmation, setTargetConfirmation] = useState<BagConfirmationValue>(DEFAULT_BAG_CONFIRMATION);
  const [sourceConfirmations, setSourceConfirmations] = useState<Record<string, BagConfirmationValue>>({});
  const updateTargetConfirmation = (patch: Partial<BagConfirmationValue>) => {
    setTargetConfirmation((prev) => ({ ...prev, ...patch }));
  };
  const updateSourceConfirmation = (grnId: string, patch: Partial<BagConfirmationValue>) => {
    setSourceConfirmations((prev) => ({ ...prev, [grnId]: { ...(prev[grnId] ?? DEFAULT_BAG_CONFIRMATION), ...patch } }));
  };
  const settlementDecision: TransferPaymentDecision = 'AGREED_PENDING';
  const settleAmount = 0;
  const paymentMode: PaymentMode = 'Cash';
  const setSettlementDecision = () => {};
  const setSettleAmount = () => {};
  const setPaymentMode = () => {};
  const repack = useMergeRepackForm();
  const {
    destinationChamber,
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
    repack.setDestinationChamber(targetGrn.chamber || '');
  }, [targetGrn.id, targetGrn.chamber]);

  useEffect(() => {
    const effectiveFacilityId = facilityId ?? currentGrn.facilityId;
    if (!effectiveFacilityId) return;
    const allParticipating = [targetGrn, ...selectedSources];
    for (const grn of allParticipating) {
      if (grn?.id && !sourceRentSummaries[grn.id]) {
        requestWithAuth(`/api/facilities/${encodeURIComponent(effectiveFacilityId)}/rent/grn/${encodeURIComponent(grn.id)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((dto: RentSummaryDto | null) => { if (dto) setSourceRentSummaries((prev) => ({ ...prev, [grn.id]: dto })); })
          .catch(() => {});
      }
    }
  }, [facilityId, currentGrn.facilityId, targetGrn, selectedSources, sourceRentSummaries]);

  const targetCommodity = useMemo(() => commodities?.find((c) => c.id === targetGrn.commodityId), [commodities, targetGrn.commodityId]);
  const commodityHamaliRate = useMemo(() => {
    if (!targetCommodity) return 0;
    return (targetCommodity.isHamaliApplicable ?? (targetCommodity.hamaliRate ?? 0) > 0) ? (targetCommodity.hamaliRate ?? 0) : 0;
  }, [targetCommodity]);

  const totalSettlementBill = useMemo(() => calculateMergeSettlementBill({
    selectedSources,
    sourceConfirmations,
    movementDate,
    commodityHamaliRate,
    targetGrn,
    sourceRentSummaries,
    commodities,
  }), [selectedSources, sourceConfirmations, movementDate, commodityHamaliRate, targetGrn, sourceRentSummaries, commodities]);

  const { isTargetDiff, isRepackRequired, isRepackFilled, actualRepackedBags } =
    deriveRepackCompositionStatus({ targetGrn, selectedSources, repackMode, repackBagType, repackQuantity, repackSmall, repackBig });

  const repackHamaliCharge = useMemo(() => {
    if (!repackMode || actualRepackedBags <= 0 || commodityHamaliRate <= 0) return 0;
    return calculateHamaliAmount(actualRepackedBags, commodityHamaliRate);
  }, [repackMode, actualRepackedBags, commodityHamaliRate]);

  const targetSmall = typeof targetConfirmation.smallBags === 'number' ? targetConfirmation.smallBags : (targetGrn.smallBags ?? 0);
  const targetBig = typeof targetConfirmation.bigBags === 'number' ? targetConfirmation.bigBags : (targetGrn.bigBags ?? 0);
  const { movedSmall, movedBig, addedBagsToTarget, targetNewRemaining, effectiveIsHybrid } =
    deriveMovedAndTargetBags({ selectedSources, sourceConfirmations, repackMode, repackBagType, isRepackFilled, repackSmall, repackBig, repackQuantity, totalSourceBags, targetCurrentRemaining, targetBagType: targetGrn.bagType, actualRepackedBags, targetSmall, targetBig });

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
    setTargetConfirmation(deriveAutoInheritedBagComposition([targetGrn], targetCurrentRemaining));
    const derived = initialConfirmations[selectedSources[0]?.id] ?? deriveAutoInheritedBagComposition(selectedSources, totalSourceBags);
    setConfirmation(derived);
    repack.applyDerivedRepackDefaults(derived, totalSourceBags);
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    const err = validateStep3Proceed({ selectedSources, sourceConfirmations, targetGrn, targetConfirmation, targetCurrentRemaining });
    if (err) return setValidationError(err);
    setStep(3);
  };

  const handleProceedToStep4 = () => {
    setValidationError(null);
    setStep(4);
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const effectiveChamber = destinationChamber.trim();
    const totalConsolidatedBags = targetCurrentRemaining + totalSourceBags;
    const err = validateMergeSubmit({
      selectedSourceIds, reason, isTargetLoanHold, targetGrnNumber: targetGrn.grnNumber,
      destinationChamber: effectiveChamber, repackMode, repackBagType, isRepackFilled,
      repackSmall, repackBig, repackQuantity, repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice,
      totalConsolidatedBags,
    });
    if (err) return setValidationError(err);

    const primaryConf = sourceConfirmations[selectedSources[0]?.id] ?? confirmation;
    const { effSmall, effBig, effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, effRepackedBagCount, resolvedCategory } =
      buildMergeExecutionPayload({ repackMode, repackBagType, repackSmall, repackBig, repackQuantity, repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice, isRepackFilled, isRepackRequired, movedSmall, movedBig, totalSourceBags, primaryConf });

    const tSmall = !targetGrn.isCompositionVerified && targetConfirmation.category !== 'Hybrid' && typeof targetConfirmation.smallBags === 'number' ? targetConfirmation.smallBags : undefined;
    const tBig = !targetGrn.isCompositionVerified && targetConfirmation.category !== 'Hybrid' && typeof targetConfirmation.bigBags === 'number' ? targetConfirmation.bigBags : undefined;
    const tCat = !targetGrn.isCompositionVerified ? targetConfirmation.category : undefined;
    const tQty = !targetGrn.isCompositionVerified && targetConfirmation.category === 'Hybrid' ? (typeof targetConfirmation.quantity === 'number' ? targetConfirmation.quantity : targetCurrentRemaining) : undefined;
    const tPrice = !targetGrn.isCompositionVerified && typeof targetConfirmation.bagPrice === 'number' ? targetConfirmation.bagPrice : undefined;
    const tSeasonalPrice = !targetGrn.isCompositionVerified && typeof targetConfirmation.seasonalBagPrice === 'number' ? targetConfirmation.seasonalBagPrice : undefined;
    const tMonthlyPrice = !targetGrn.isCompositionVerified && typeof targetConfirmation.monthlyBagPrice === 'number' ? targetConfirmation.monthlyBagPrice : undefined;

    await onExecuteMerge(
      targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, effSmall, effBig,
      typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      undefined, undefined, resolvedCategory,
      effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, repackMode, effRepackedBagCount,
      effectiveChamber, tSmall, tBig, tCat, tQty, tPrice, tSeasonalPrice, tMonthlyPrice,
      repack.partyMark.trim() || undefined, repack.storageMark.trim() || undefined,
    );
  };

  return {
    step, setStep, targetGrnId, setTargetGrnId, selectedSourceIds, setSelectedSourceIds,
    movementDate, reason, setReason, remarks, setRemarks, confirmation, setConfirmation,
    targetConfirmation, setTargetConfirmation, updateTargetConfirmation,
    sourceConfirmations, setSourceConfirmations, updateSourceConfirmation, sourceRentSummaries,
    settlementDecision, setSettlementDecision, settleAmount, setSettleAmount, paymentMode, setPaymentMode,
    ...repack, validationError, setValidationError, openGrns, targetGrn, targetSeason,
    eligibleSources, futureSeasonCount, recommendedSwitchGrn, targetOptions, handleTargetChange, handleToggleSource, handleSwitchTarget: handleTargetChange,
    selectedSources, totalSourceBags, targetCurrentRemaining, isTargetLoanHold,
    totalSourcePendingRent: totalSettlementBill, totalSettlementBill, isTargetDiff, isRepackFilled, commodityHamaliRate, actualRepackedBags,
    repackHamaliCharge, movedSmall, movedBig, addedBagsToTarget, targetNewRemaining,
    resultingBagType, handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleMergeSubmit,
  };
}
