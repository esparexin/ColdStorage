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
import { DEFAULT_BAG_CONFIRMATION, deriveAutoInheritedBagComposition, type BagConfirmationValue } from './bagConfirmation.helper';
import { calculateMergeGrandTotal } from './mergeRentAssessment.helper';
import {
  filterEligibleTargetGrns, findForwardMergeTarget, partitionMergeSources,
  resolveInitialMergeState, resolveNextSelectedSources,
} from './mergeEligibility.helper';
import { validateMergePaymentDecision } from './internalMovementPayload.helper';

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
  const [repackMode, setRepackMode] = useState(false); const [repackBagType, setRepackBagType] = useState<'S/B' | 'Hybrid'>('S/B');
  const [repackSmall, setRepackSmall] = useState<number | ''>(''); const [repackBig, setRepackBig] = useState<number | ''>('');
  const [repackQuantity, setRepackQuantity] = useState<number | ''>(''); const [referenceWeight, setReferenceWeight] = useState<number | ''>('');
  const [repackSeasonalBagPrice, setRepackSeasonalBagPrice] = useState<number | ''>(''); const [repackMonthlyBagPrice, setRepackMonthlyBagPrice] = useState<number | ''>('');
  const [repackBagPrice, setRepackBagPrice] = useState<number | ''>(''); const [validationError, setValidationError] = useState<string | null>(null);
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

  const isTargetDiff = (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) && targetGrn.smallBagPrice !== targetGrn.bigBagPrice;
  const isTargetVerified = resolveStoredCompositionVerified({ isCompositionVerified: targetGrn.isCompositionVerified, bagType: targetGrn.bagType, bags: targetGrn.bags, smallBags: targetGrn.smallBags, bigBags: targetGrn.bigBags });
  const allSourcesVerified = selectedSources.every((s) => resolveStoredCompositionVerified({ isCompositionVerified: s.isCompositionVerified, bagType: s.bagType, bags: s.bags, smallBags: s.smallBags, bigBags: s.bigBags }));
  const isRepackRequired = repackMode || (selectedSources.length > 0 && (isTargetDiff || selectedSources.some((s) => (s.smallBagPrice != null || s.bigBagPrice != null) && s.smallBagPrice !== s.bigBagPrice)) && (!isTargetVerified || !allSourcesVerified));
  const isRepackFilled = repackBagType === 'Hybrid'
    ? typeof repackQuantity === 'number' && Number.isInteger(repackQuantity) && repackQuantity > 0
    : typeof repackSmall === 'number' && typeof repackBig === 'number' && Number.isInteger(repackSmall) && Number.isInteger(repackBig);

  const actualRepackedBags = repackMode && isRepackFilled
    ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : Number(repackSmall) + Number(repackBig)) : 0;
  const repackHamaliCharge = useMemo(
    () => (repackMode && actualRepackedBags > 0 && commodityHamaliRate > 0 ? calculateHamaliAmount(actualRepackedBags, commodityHamaliRate) : 0),
    [repackMode, actualRepackedBags, commodityHamaliRate],
  );

  const confSmall = selectedSources.reduce((acc, s) => {
    const c = sourceConfirmations[s.id];
    if (c && isHybridBagCategory(c.category)) return acc;
    return acc + (c && typeof c.smallBags === 'number' ? c.smallBags : (s.smallBags ?? (s.closingBags ?? s.bags)));
  }, 0);
  const confBig = selectedSources.reduce((acc, s) => {
    const c = sourceConfirmations[s.id];
    if (c && isHybridBagCategory(c.category)) return acc;
    return acc + (c && typeof c.bigBags === 'number' ? c.bigBags : (s.bigBags ?? 0));
  }, 0);
  const repackedHybridSplit = useMemo(
    () => allocateHybridSplit(confSmall, confBig, typeof repackQuantity === 'number' ? repackQuantity : totalSourceBags),
    [confSmall, confBig, repackQuantity, totalSourceBags],
  );
  const movedSmall = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? repackedHybridSplit.smallBags : Number(repackSmall)) : confSmall;
  const movedBig = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? repackedHybridSplit.bigBags : Number(repackBig)) : confBig;
  const addedBagsToTarget = repackMode ? (isRepackFilled ? actualRepackedBags : 0) : totalSourceBags;
  const targetNewRemaining = targetCurrentRemaining + addedBagsToTarget;

  const anySourceHybrid = selectedSources.some((s) => isHybridBagCategory(sourceConfirmations[s.id]?.category));
  const effectiveIsHybrid = repackMode ? repackBagType === 'Hybrid' : (anySourceHybrid || isHybridBagCategory(targetGrn.bagType));
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
    const initialConfirmations: Record<string, BagConfirmationValue> = {};
    for (const s of selectedSources) initialConfirmations[s.id] = deriveAutoInheritedBagComposition([s], s.closingBags ?? s.bags);
    setSourceConfirmations(initialConfirmations);
    const derived = initialConfirmations[selectedSources[0]?.id] ?? deriveAutoInheritedBagComposition(selectedSources, totalSourceBags);
    setConfirmation(derived); setRepackBagType(isHybridBagCategory(derived.category) ? 'Hybrid' : 'S/B');
    setRepackQuantity(totalSourceBags); setRepackSeasonalBagPrice(derived.seasonalBagPrice);
    setRepackMonthlyBagPrice(derived.monthlyBagPrice); setRepackBagPrice(derived.bagPrice);
    if (selectedSourceIds.length > 1) setSettlementDecision('AGREED_PENDING');
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    for (const s of selectedSources) {
      const conf = sourceConfirmations[s.id] ?? deriveAutoInheritedBagComposition([s], s.closingBags ?? s.bags);
      const bags = s.closingBags ?? s.bags;
      if (!isHybridBagCategory(conf.category)) {
        const sm = typeof conf.smallBags === 'number' ? conf.smallBags : 0;
        const bg = typeof conf.bigBags === 'number' ? conf.bigBags : 0;
        if (sm + bg !== bags) return setValidationError(`Source GRN '${s.grnNumber}': Confirmed Small (${sm}) and Big (${bg}) bags must equal ${bags} bags.`);
      } else if ((typeof conf.quantity === 'number' ? conf.quantity : 0) !== bags) {
        return setValidationError(`Source GRN '${s.grnNumber}': Hybrid bags must match ${bags} bags.`);
      }
    }
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
    if (selectedSourceIds.length === 0) return setValidationError('Select at least one source GRN to merge.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    if (isTargetLoanHold) return setValidationError(`Target GRN '${targetGrn.grnNumber}' has an active loan hold.`);
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

    const primaryConf = sourceConfirmations[selectedSources[0]?.id] ?? confirmation;
    const isSb = (!repackMode && (primaryConf.category === 'S/B' || primaryConf.category === 'Small & Big')) || (repackMode && repackBagType === 'S/B');
    const effSmall = repackMode ? (repackBagType === 'Hybrid' ? movedSmall : Number(repackSmall)) : (isRepackFilled ? Number(repackSmall) : (typeof primaryConf.smallBags === 'number' ? primaryConf.smallBags : undefined));
    const effBig = repackMode ? (repackBagType === 'Hybrid' ? movedBig : Number(repackBig)) : (isRepackFilled ? Number(repackBig) : (typeof primaryConf.bigBags === 'number' ? primaryConf.bigBags : undefined));
    const effQuantity = repackMode ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : undefined) : (isHybridBagCategory(primaryConf.category) ? totalSourceBags : (typeof primaryConf.quantity === 'number' ? primaryConf.quantity : undefined));
    const effBagPrice = repackMode ? (typeof repackBagPrice === 'number' ? repackBagPrice : undefined) : (typeof primaryConf.bagPrice === 'number' ? primaryConf.bagPrice : undefined);
    const effSeasonalPrice = repackMode ? (typeof repackSeasonalBagPrice === 'number' ? repackSeasonalBagPrice : undefined) : (typeof primaryConf.seasonalBagPrice === 'number' ? primaryConf.seasonalBagPrice : undefined);
    const effMonthlyPrice = repackMode ? (typeof repackMonthlyBagPrice === 'number' ? repackMonthlyBagPrice : undefined) : (typeof primaryConf.monthlyBagPrice === 'number' ? primaryConf.monthlyBagPrice : undefined);
    const effRepackedBagCount = repackMode && isRepackFilled ? (repackBagType === 'Hybrid' ? Number(repackQuantity) : (Number(repackSmall) + Number(repackBig))) : undefined;
    const isSettleNow = settlementDecision === 'SETTLE_NOW' && settleAmount > 0;

    await onExecuteMerge(
      targetGrnId, selectedSourceIds, reason.trim(), remarks.trim() || undefined, movementDate, 0, effSmall, effBig,
      typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      isSettleNow ? settleAmount : undefined, isSettleNow ? paymentMode : undefined,
      repackMode ? repackBagType : ((!isSb || isRepackRequired || isRepackFilled || typeof primaryConf.smallBags === 'number') ? primaryConf.category : undefined),
      effQuantity, effBagPrice, effSeasonalPrice, effMonthlyPrice, repackMode, effRepackedBagCount,
    );
  };

  return {
    step, setStep, targetGrnId, setTargetGrnId, selectedSourceIds, setSelectedSourceIds,
    movementDate, reason, setReason, remarks, setRemarks, confirmation, setConfirmation,
    sourceConfirmations, setSourceConfirmations, updateSourceConfirmation, sourceRentSummaries,
    settlementDecision, setSettlementDecision, settleAmount, setSettleAmount, paymentMode, setPaymentMode,
    repackMode, setRepackMode, repackBagType, setRepackBagType, repackSmall, setRepackSmall, repackBig, setRepackBig,
    repackQuantity, setRepackQuantity, repackSeasonalBagPrice, setRepackSeasonalBagPrice, repackMonthlyBagPrice, setRepackMonthlyBagPrice,
    repackBagPrice, setRepackBagPrice, referenceWeight, setReferenceWeight, validationError, openGrns, targetGrn, targetSeason,
    eligibleSources, futureSeasonCount, recommendedSwitchGrn, targetOptions, handleTargetChange, handleToggleSource, handleSwitchTarget: handleTargetChange,
    selectedSources, totalSourceBags, targetCurrentRemaining, isTargetLoanHold,
    totalSourcePendingRent, isTargetDiff, isRepackFilled, commodityHamaliRate, actualRepackedBags,
    repackHamaliCharge, movedSmall, movedBig, addedBagsToTarget, targetNewRemaining,
    resultingBagType, handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleMergeSubmit,
  };
}
