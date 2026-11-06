'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  isHybridBagCategory, resolveTotalRentObligation, toOperationalBagType,
  type Commodity, type Customer, type Grn, type OperationalBagType, type OutwardBagCategory, type PaymentMode,
  type TransferPaymentDecision, type TransferSettlementDetails,
} from '@cold-storage/contracts';
import { useRentGate } from '@/hooks/useRentGate';
import { calculateMergeSourceRentSummary } from './mergeRentAssessment.helper';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import { validateTransferPayment } from './internalMovementPayload.helper';
import { validateTransferConfirmation, validateTransferRepack } from './transferTabValidation.helper';
import { resolveCandidateTransferees } from './transferCandidateCustomer.helper';
import { resolveTransferRates } from './transferRentRates.helper';

export interface UseInternalMovementTransferTabProps {
  currentGrn: Grn;
  facilityId: string;
  customers: Customer[];
  commodities?: Commodity[];
  onExecuteTransfer: (
    newCustomerId: string, movementDate: string, reason: string, remarks?: string,
    paymentDecision?: TransferPaymentDecision, settlementDetails?: TransferSettlementDetails,
    confirmation?: {
      confirmedSmallBags?: number; confirmedBigBags?: number;
      sourceBagCategory?: OutwardBagCategory; sourceQuantity?: number;
      sourceBagPrice?: number; sourceSeasonalBagPrice?: number; sourceMonthlyBagPrice?: number;
    },
    repack?: {
      destinationChamber?: string; resultingBagType?: import('@cold-storage/contracts').BagType;
      repackedSmallBags?: number; repackedBigBags?: number;
      repackedQuantity?: number; referenceWeight?: number;
    },
  ) => Promise<void>;
}

export function useInternalMovementTransferTab({
  currentGrn, facilityId, customers, commodities, onExecuteTransfer,
}: UseInternalMovementTransferTabProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<TransferPaymentDecision>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);

  const remainingBags = currentGrn.closingBags ?? currentGrn.bags;
  const initialSb = currentGrn.isCompositionVerified === true &&
    !isHybridBagCategory(currentGrn.bagType) &&
    ((currentGrn.smallBags ?? 0) + (currentGrn.bigBags ?? 0) === remainingBags);
  const [confirmedSmallBags, setConfirmedSmallBags] = useState<number | ''>(initialSb ? (currentGrn.smallBags ?? 0) : '');
  const [confirmedBigBags, setConfirmedBigBags] = useState<number | ''>(initialSb ? (currentGrn.bigBags ?? 0) : '');
  const [sourceBagCategory, setSourceBagCategory] = useState<OutwardBagCategory>(
    toOperationalBagType(currentGrn.bagType),
  );
  const [sourceBagPrice, setSourceBagPrice] = useState<number | ''>('');
  const [sourceSeasonalBagPrice, setSourceSeasonalBagPrice] = useState<number | ''>('');
  const [sourceMonthlyBagPrice, setSourceMonthlyBagPrice] = useState<number | ''>('');
  const [destinationChamber, setDestinationChamber] = useState<string>(currentGrn.chamber || '');
  const [resultingBagType, setResultingBagType] = useState<OperationalBagType>(toOperationalBagType(currentGrn.bagType));
  const [repackedSmallBags, setRepackedSmallBags] = useState<number | ''>('');
  const [repackedBigBags, setRepackedBigBags] = useState<number | ''>('');
  const [repackedQuantity, setRepackedQuantity] = useState<number | ''>('');
  const [referenceWeight, setReferenceWeight] = useState<number | ''>(currentGrn.totalBagsWeight != null ? currentGrn.totalBagsWeight : '');

  const { rentSummary, rentLoading, refreshRentGate } = useRentGate();
  useEffect(() => { void refreshRentGate(facilityId, currentGrn.id); }, [facilityId, currentGrn.id, refreshRentGate]);

  const candidateCustomers = useMemo(
    () => resolveCandidateTransferees(customers, currentGrn.customerId, createdCustomers),
    [customers, currentGrn.customerId, createdCustomers],
  );
  const selectedNewCustomer = useMemo(() => candidateCustomers.find((c) => c.id === newCustomerId), [candidateCustomers, newCustomerId]);

  const isUnverified = currentGrn.isCompositionVerified === false;
  const isHybrid = isHybridBagCategory(sourceBagCategory);

  const commodity = useMemo(() => commodities?.find((c) => c.id === currentGrn.commodityId), [commodities, currentGrn.commodityId]);
  const { seasonalRates, monthlyRates } = useMemo(() => resolveTransferRates(currentGrn, commodity), [currentGrn, commodity]);

  const effectiveHamaliRate = useMemo(() => {
    if (typeof currentGrn.hamaliRate === 'number') return currentGrn.hamaliRate;
    const isApp = commodity?.isHamaliApplicable ?? ((commodity?.hamaliRate ?? 0) > 0);
    return isApp ? (commodity?.hamaliRate ?? 0) : 0;
  }, [currentGrn.hamaliRate, commodity]);

  const bagConfirmation = useMemo<BagConfirmationValue>(() => ({
    category: (sourceBagCategory || 'S/B') as OutwardBagCategory,
    quantity: isHybrid ? remainingBags : '',
    bagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : '',
    seasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : '',
    monthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : '',
    smallBags: typeof confirmedSmallBags === 'number' ? confirmedSmallBags : '',
    bigBags: typeof confirmedBigBags === 'number' ? confirmedBigBags : '',
  }), [sourceBagCategory, isHybrid, remainingBags, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice, confirmedSmallBags, confirmedBigBags]);

  const rentCalc = useMemo(() => calculateMergeSourceRentSummary({
    source: currentGrn,
    confirmation: bagConfirmation,
    movementDate,
    commodityHamaliRate: effectiveHamaliRate,
    summary: rentSummary,
    commodity,
  }), [currentGrn, bagConfirmation, movementDate, effectiveHamaliRate, rentSummary, commodity]);

  const assessedRent = rentCalc.totalRent;
  const hamaliAmount = rentCalc.hamaliAmount;
  const totalPaid = rentSummary?.totalPaid ?? 0;
  const pendingAmount = rentSummary?.remainingBalance ?? 0;
  const effectiveObligation = resolveTotalRentObligation({
    rentType: currentGrn.rentType,
    rentAmount: rentCalc.totalRent,
    outwardRentCharges: 0,
    extensionAmounts: rentSummary?.extensions?.map((e) => e.finalAmount),
    hamaliShare: rentCalc.hamaliAmount,
  });
  const effectiveDue = Math.max(0, effectiveObligation - totalPaid);
  const isUnbilled = totalPaid === 0 && effectiveDue === 0 && (rentSummary?.rentAmount ?? 0) === 0;

  useEffect(() => {
    if (effectiveDue > 0 && settleAmount === 0) setSettleAmount(effectiveDue);
  }, [effectiveDue, settleAmount]);

  const handleProceedToStep2 = () => {
    setValidationError(null);
    if (!newCustomerId) return setValidationError('Please select the new customer to transfer ownership to.');
    if (remainingBags <= 0) return setValidationError('Cannot transfer ownership: No stock remaining in this GRN.');
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setValidationError(null);
    const payErr = validateTransferPayment(decision, settleAmount, effectiveDue);
    if (payErr) return setValidationError(payErr);
    const confirmErr = validateTransferConfirmation({
      isUnverified, remainingBags, confirmedSmallBags, confirmedBigBags,
      sourceBagCategory, sourceQuantity: isHybrid ? remainingBags : undefined,
      sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
    });
    if (confirmErr) return setValidationError(confirmErr);
    setStep(3);
  };

  const handleProceedToStep4 = () => {
    setValidationError(null);
    const repackErr = validateTransferRepack({
      resultingBagType, destinationChamber, totalBags: remainingBags,
      repackedSmallBags, repackedBigBags, repackedQuantity, referenceWeight,
    });
    if (repackErr) return setValidationError(repackErr);
    setStep(4);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!newCustomerId) return setValidationError('Select the new customer to transfer ownership to.');
    if (remainingBags <= 0) return setValidationError('Cannot transfer ownership: No stock remaining in this GRN.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    setShowConfirm(true);
  };

  const doExecuteTransfer = async () => {
    const conf = isHybrid ? {
      sourceBagCategory: sourceBagCategory || undefined, sourceQuantity: remainingBags,
      sourceBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
      sourceSeasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
      sourceMonthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
    } : typeof confirmedSmallBags === 'number' && typeof confirmedBigBags === 'number'
      ? { confirmedSmallBags, confirmedBigBags } : undefined;

    await onExecuteTransfer(
      newCustomerId, movementDate, reason.trim(), remarks.trim() || undefined,
      effectiveDue > 0 ? decision : undefined,
      effectiveDue > 0 && decision === 'SETTLE_NOW' ? { amountPaid: settleAmount, paymentMode } : undefined,
      conf,
      {
        destinationChamber: destinationChamber.trim(),
        resultingBagType,
        repackedSmallBags: resultingBagType === 'Hybrid' ? undefined : (typeof repackedSmallBags === 'number' ? repackedSmallBags : undefined),
        repackedBigBags: resultingBagType === 'Hybrid' ? undefined : (typeof repackedBigBags === 'number' ? repackedBigBags : undefined),
        repackedQuantity: resultingBagType === 'Hybrid' ? (typeof repackedQuantity === 'number' ? repackedQuantity : undefined) : undefined,
        referenceWeight: typeof referenceWeight === 'number' && referenceWeight > 0 ? referenceWeight : undefined,
      },
    );
  };

  return {
    step, setStep, showConfirm, setShowConfirm, newCustomerId, setNewCustomerId,
    setCreatedCustomers, movementDate, reason, setReason, remarks, setRemarks,
    decision, setDecision, settleAmount, setSettleAmount, paymentMode, setPaymentMode,
    validationError, remainingBags, confirmedSmallBags, setConfirmedSmallBags,
    confirmedBigBags, setConfirmedBigBags, sourceBagCategory, setSourceBagCategory,
    sourceBagPrice, setSourceBagPrice, sourceSeasonalBagPrice, setSourceSeasonalBagPrice,
    sourceMonthlyBagPrice, setSourceMonthlyBagPrice, destinationChamber, setDestinationChamber,
    resultingBagType, setResultingBagType, repackedSmallBags, setRepackedSmallBags,
    repackedBigBags, setRepackedBigBags, repackedQuantity, setRepackedQuantity,
    referenceWeight, setReferenceWeight, rentLoading, candidateCustomers, selectedNewCustomer,
    isUnverified, seasonalRates, monthlyRates, assessedRent, effectiveHamaliRate, hamaliAmount,
    totalPaid, pendingAmount, isUnbilled, effectiveDue,
    handleProceedToStep2, handleProceedToStep3, handleProceedToStep4, handleTransferSubmit, doExecuteTransfer,
  };
}
