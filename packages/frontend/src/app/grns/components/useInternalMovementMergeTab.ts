'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  allocateHybridSplit, calculateHamaliAmount, hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE, isHybridBagCategory, resolveMergedBagType,
  resolveStoredCompositionVerified, seasonYearForInwardDate,
  type Commodity, type Grn, type OutwardBagCategory, type PaymentMode,
  type RentSummaryDto, type TransferPaymentDecision,
} from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { DEFAULT_BAG_CONFIRMATION, deriveAutoInheritedBagComposition, previewConfirmedSplit, type BagConfirmationValue } from './bagConfirmation.helper';
import {
  filterEligibleTargetGrns, findForwardMergeTarget, partitionMergeSources,
  resolveInitialMergeState, resolveNextSelectedSources,
} from './mergeEligibility.helper';
import { validateMergePaymentDecision } from './internalMovementPayload.helper';

export interface UseInternalMovementMergeTabProps {
  currentGrn: Grn; facilityId?: string; allGrns: Grn[]; commodities?: Commodity[]; submitting: boolean; initiatingGrnId?: string;
  onExecuteMerge: (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number, isRepackSelected?: boolean, repackedBagCount?: number,
  ) => Promise<void>;
}

export function useInternalMovementMergeTab({
  currentGrn, facilityId, allGrns, commodities, onExecuteMerge, initiatingGrnId,
}: UseInternalMovementMergeTabProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const openGrns = useMemo(() => allGrns.filter((g) => g.status === 'OPEN'), [allGrns]);
  const [targetGrnId, setTargetGrnId] = useState<string>(() => resolveInitialMergeState(currentGrn, allGrns.filter((g) => g.status === 'OPEN')).initialTargetId);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() => resolveInitialMergeState(currentGrn, allGrns.filter((g) => g.status === 'OPEN')).initialSourceIds);
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(''); const [remarks, setRemarks] = useState('');
  const [confirmation, setConfirmation] = useState<BagConfirmationValue>(DEFAULT_BAG_CONFIRMATION);
  const [settlementDecision, setSettlementDecision] = useState<TransferPaymentDecision>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0); const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [repackMode, setRepackMode] = useState(false); const [repackBagType, setRepackBagType] = useState<'S/B' | 'Hybrid'>('S/B');
  const [repackSmall, setRepackSmall] = useState<number | ''>(''); const [repackBig, setRepackBig] = useState<number | ''>('');
  const [repackQuantity, setRepackQuantity] = useState<number | ''>(''); const [referenceWeight, setReferenceWeight] = useState<number | ''>('');
  const [repackSeasonalBagPrice, setRepackSeasonalBagPrice] = useState<number | ''>(''); const [repackMonthlyBagPrice, setRepackMonthlyBagPrice] = useState<number | ''>('');
  const [repackBagPrice, setRepackBagPrice] = useState<number | ''>(''); const [validationError, setValidationError] = useState<string | null>(null);
  const [sourceRentSummaries, setSourceRentSummaries] = useState<Record<string, RentSummaryDto>>({});

  useEffect(() => {
    if (targetGrnId === currentGrn.id && selectedSourceIds.length === 0) {
      const init = resolveInitialMergeState(currentGrn, openGrns);
      if (init.initialTargetId !== currentGrn.id) {
        setTargetGrnId(init.initialTargetId);
        setSelectedSourceIds(init.initialSourceIds);
      }
    }
  }, [openGrns, currentGrn, targetGrnId, selectedSourceIds.length]);

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
    () => filterEligibleTargetGrns(openGrns, currentGrn, selectedSourceIds, targetGrnId),
    [openGrns, currentGrn, selectedSourceIds, targetGrnId],
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
  const isRepackFilled = repackBagType === 'Hybrid'
    ? typeof repackQuantity === 'number' && Number.isInteger(repackQuantity) && repackQuantity > 0
    : typeof repackSmall === 'number' && typeof repackBig === 'number' && Number.isInteger(repackSmall) && Number.isInteger(repackBig);

  const targetCommodity = useMemo(() => commodities?.find((c) => c.id === targetGrn.commodityId), [commodities, targetGrn.commodityId]);
  const commodityHamaliRate = useMemo(() => {
    if (!targetCommodity) return 0;
    return (targetCommodity.isHamaliApplicable ?? (targetCommodity.hamaliRate ?? 0) > 0) ? (targetCommodity.hamaliRate ?? 0) : 0;
  }, [targetCommodity]);

  const actualRepackedBags = repackMode && isRepackFilled
    ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : Number(repackSmall) + Number(repackBig)) : 0;
  const repackHamaliCharge = useMemo(
    () => (repackMode && actualRepackedBags > 0 && commodityHamaliRate > 0 ? calculateHamaliAmount(actualRepackedBags, commodityHamaliRate) : 0),
    [repackMode, actualRepackedBags, commodityHamaliRate],
  );

  const rawSmall = selectedSources.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
  const rawBig = selectedSources.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
  const scale = totalSourceBags > 0 && rawSmall + rawBig > 0 && rawSmall + rawBig !== totalSourceBags ? totalSourceBags / (rawSmall + rawBig) : 1;
  const defSmall = scale === 1 ? rawSmall : Math.round(rawSmall * scale);
  const previewSplit = previewConfirmedSplit({
    category: confirmation.category, rawSmall, rawBig, total: totalSourceBags,
    defaultSmall: defSmall, defaultBig: totalSourceBags - defSmall, repackSmall, repackBig, isRepackFilled,
    confirmedSmall: confirmation.smallBags, confirmedBig: confirmation.bigBags,
  });
  const repackedHybridSplit = useMemo(
    () => allocateHybridSplit(rawSmall, rawBig, typeof repackQuantity === 'number' ? repackQuantity : totalSourceBags),
    [rawSmall, rawBig, repackQuantity, totalSourceBags],
  );
  const movedSmall = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? repackedHybridSplit.smallBags : Number(repackSmall)) : previewSplit.small;
  const movedBig = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? repackedHybridSplit.bigBags : Number(repackBig)) : previewSplit.big;
  const addedBagsToTarget = repackMode ? (isRepackFilled ? actualRepackedBags : 0) : totalSourceBags;
  const targetNewRemaining = targetCurrentRemaining + addedBagsToTarget;

  const effectiveIsHybrid = repackMode ? repackBagType === 'Hybrid' : (isHybridBagCategory(confirmation.category) || isHybridBagCategory(targetGrn.bagType));
  const resultingBagType = useMemo(() => resolveMergedBagType({
    targetBagType: targetGrn.bagType,
    sourceBagTypes: effectiveIsHybrid ? ['Hybrid'] : selectedSources.map((s) => s.bagType),
    newSmallBags: (targetGrn.smallBags ?? 0) + movedSmall,
    newBigBags: (targetGrn.bigBags ?? 0) + movedBig,
  }), [targetGrn.bagType, targetGrn.smallBags, targetGrn.bigBags, selectedSources, movedSmall, movedBig, effectiveIsHybrid]);

  const handleProceedToStep2 = () => {
    setValidationError(null);
    if (!targetGrnId) return setValidationError('Please select the surviving target GRN.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
    if (targetCurrentRemaining <= 0) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has zero remaining stock.`);
    if (selectedSourceIds.length === 0) return setValidationError('Please select at least one source GRN to merge.');
    const derived = deriveAutoInheritedBagComposition(selectedSources, totalSourceBags);
    setConfirmation(derived); setRepackBagType(isHybridBagCategory(derived.category) ? 'Hybrid' : 'S/B');
    setRepackQuantity(totalSourceBags); setRepackSeasonalBagPrice(derived.seasonalBagPrice);
    setRepackMonthlyBagPrice(derived.monthlyBagPrice); setRepackBagPrice(derived.bagPrice);
    if (selectedSourceIds.length > 1) setSettlementDecision('AGREED_PENDING');
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    const isHybrid = isHybridBagCategory(confirmation.category);
    if (!isHybrid) {
      const s = typeof confirmation.smallBags === 'number' ? confirmation.smallBags : 0;
      const b = typeof confirmation.bigBags === 'number' ? confirmation.bigBags : 0;
      if (s + b !== totalSourceBags) return setValidationError(`Confirmed Small (${s}) and Big (${b}) bags must equal total moved bags (${totalSourceBags}).`);
    } else {
      const qty = typeof confirmation.quantity === 'number' ? confirmation.quantity : 0;
      if (qty !== totalSourceBags) return setValidationError(`Hybrid bags (${qty}) must match total moved stock (${totalSourceBags}).`);
    }
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
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
    if (selectedSources.length > 1 && settlementDecision === 'SETTLE_NOW') return setValidationError('Inline settlement requires a single source GRN. Choose Option A to carry forward.');
    if (repackMode) {
      if (repackBagType === 'S/B') {
        if (!isRepackFilled || Number(repackSmall) < 0 || Number(repackBig) < 0) return setValidationError('Both Repacked Small and Big bag counts are required.');
      } else {
        if (!isRepackFilled || Number(repackQuantity) <= 0) return setValidationError('Repacked Hybrid bag count is required and must be greater than zero.');
        if (Number(repackQuantity) !== totalSourceBags) return setValidationError(`Confirmed Hybrid quantity (${repackQuantity}) must match total moved stock of ${totalSourceBags} bags.`);
        const hasRate = hasPositiveHybridRate({
          bagPrice: typeof repackBagPrice === 'number' ? repackBagPrice : undefined,
          seasonalBagPrice: typeof repackSeasonalBagPrice === 'number' ? repackSeasonalBagPrice : undefined,
          monthlyBagPrice: typeof repackMonthlyBagPrice === 'number' ? repackMonthlyBagPrice : undefined,
        });
        if (!hasRate) return setValidationError(HYBRID_RATE_REQUIRED_MESSAGE);
      }
    }

    const isSb = (!repackMode && (confirmation.category === 'S/B' || confirmation.category === 'Small & Big')) || (repackMode && repackBagType === 'S/B');
    const effSmall = repackMode ? (repackBagType === 'Hybrid' ? movedSmall : Number(repackSmall)) : (isRepackFilled ? Number(repackSmall) : (typeof confirmation.smallBags === 'number' ? confirmation.smallBags : undefined));
    const effBig = repackMode ? (repackBagType === 'Hybrid' ? movedBig : Number(repackBig)) : (isRepackFilled ? Number(repackBig) : (typeof confirmation.bigBags === 'number' ? confirmation.bigBags : undefined));
    const effQuantity = repackMode ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : undefined) : (isHybridBagCategory(confirmation.category) ? totalSourceBags : (typeof confirmation.quantity === 'number' ? confirmation.quantity : undefined));
    const effBagPrice = repackMode ? (typeof repackBagPrice === 'number' ? repackBagPrice : undefined) : (typeof confirmation.bagPrice === 'number' ? confirmation.bagPrice : undefined);
    const effSeasonalPrice = repackMode ? (typeof repackSeasonalBagPrice === 'number' ? repackSeasonalBagPrice : undefined) : (typeof confirmation.seasonalBagPrice === 'number' ? confirmation.seasonalBagPrice : undefined);
    const effMonthlyPrice = repackMode ? (typeof repackMonthlyBagPrice === 'number' ? repackMonthlyBagPrice : undefined) : (typeof confirmation.monthlyBagPrice === 'number' ? confirmation.monthlyBagPrice : undefined);
    const effRepackedBagCount = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : (Number(repackSmall) + Number(repackBig))) : undefined;
    const isSettleNow = settlementDecision === 'SETTLE_NOW' && settleAmount > 0;

    await onExecuteMerge(
      targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, effSmall, effBig,
      typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      isSettleNow ? settleAmount : undefined, isSettleNow ? paymentMode : undefined,
      repackMode ? repackBagType : ((!isSb || isRepackRequired || isRepackFilled || typeof confirmation.smallBags === 'number') ? confirmation.category : undefined),
      effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, repackMode, effRepackedBagCount,
    );
  };

  return {
    step, setStep, targetGrnId, setTargetGrnId, selectedSourceIds, setSelectedSourceIds,
    movementDate, reason, setReason, remarks, setRemarks, confirmation, setConfirmation,
    settlementDecision, setSettlementDecision, settleAmount, setSettleAmount,
    paymentMode, setPaymentMode, repackMode, setRepackMode, repackBagType, setRepackBagType,
    repackSmall, setRepackSmall, repackBig, setRepackBig, repackQuantity, setRepackQuantity,
    repackSeasonalBagPrice, setRepackSeasonalBagPrice, repackMonthlyBagPrice, setRepackMonthlyBagPrice,
    repackBagPrice, setRepackBagPrice, referenceWeight, setReferenceWeight, validationError,
    openGrns, targetGrn, targetSeason, eligibleSources, futureSeasonCount, recommendedSwitchGrn,
    targetOptions, handleTargetChange, handleToggleSource, handleSwitchTarget: handleTargetChange,
    selectedSources, totalSourceBags, targetCurrentRemaining, isTargetLoanHold,
    totalSourcePendingRent, isTargetDiff, isRepackFilled, commodityHamaliRate, actualRepackedBags,
    repackHamaliCharge, movedSmall, movedBig, addedBagsToTarget, targetNewRemaining,
    resultingBagType, handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleMergeSubmit,
  };
}
