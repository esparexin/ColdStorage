'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  calculateHamaliAmount,
  isHybridBagCategory, resolveTotalRentObligation,
  type Commodity, type Customer, type Grn, type OperationalBagType, type OutwardBagCategory, type PaymentMode,
  type TransferPaymentDecision, type TransferSettlementDetails,
} from '@cold-storage/contracts';
import { useRentGate } from '@/hooks/useRentGate';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';
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
    currentGrn.bagType !== 'Hybrid' &&
    ((currentGrn.smallBags ?? 0) + (currentGrn.bigBags ?? 0) === remainingBags);
  const [confirmedSmallBags, setConfirmedSmallBags] = useState<number | ''>(initialSb ? (currentGrn.smallBags ?? 0) : '');
  const [confirmedBigBags, setConfirmedBigBags] = useState<number | ''>(initialSb ? (currentGrn.bigBags ?? 0) : '');
  const [sourceBagCategory, setSourceBagCategory] = useState<OutwardBagCategory>(
    isHybridBagCategory(currentGrn.bagType) ? 'Hybrid' : 'S/B',
  );
  const [sourceBagPrice, setSourceBagPrice] = useState<number | ''>('');
  const [sourceSeasonalBagPrice, setSourceSeasonalBagPrice] = useState<number | ''>('');
  const [sourceMonthlyBagPrice, setSourceMonthlyBagPrice] = useState<number | ''>('');
  const [destinationChamber, setDestinationChamber] = useState<string>(currentGrn.chamber || '');
  const [resultingBagType, setResultingBagType] = useState<OperationalBagType>(currentGrn.bagType === 'Hybrid' ? 'Hybrid' : 'S/B');
  const [repackedSmallBags, setRepackedSmallBags] = useState<number | ''>(initialSb ? (currentGrn.smallBags ?? 0) : '');
  const [repackedBigBags, setRepackedBigBags] = useState<number | ''>(initialSb ? (currentGrn.bigBags ?? 0) : '');
  const [repackedQuantity, setRepackedQuantity] = useState<number | ''>(remainingBags);
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
  const smallBags = isHybrid ? remainingBags : (typeof confirmedSmallBags === 'number' ? confirmedSmallBags : currentGrn.smallBags ?? 0);
  const bigBags = isHybrid ? 0 : (typeof confirmedBigBags === 'number' ? confirmedBigBags : currentGrn.bigBags ?? 0);

  const commodity = useMemo(() => commodities?.find((c) => c.id === currentGrn.commodityId), [commodities, currentGrn.commodityId]);
  const { seasonalRates, monthlyRates } = useMemo(() => resolveTransferRates(currentGrn, commodity), [currentGrn, commodity]);

  const assessedRent = useMemo(() => computeOutwardRentCharge({
    rentType: currentGrn.rentType, bagCategory: (sourceBagCategory || 'S/B') as OutwardBagCategory,
    smallBags, bigBags, quantity: isHybrid ? smallBags : undefined,
    manualBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
    seasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
    monthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
    inwardDate: currentGrn.date, deliveryDate: movementDate,
    smallBagPrice: currentGrn.smallBagPrice ?? seasonalRates.small,
    bigBagPrice: currentGrn.bigBagPrice ?? seasonalRates.big,
    monthlySmallBagPrice: monthlyRates.small, monthlyBigBagPrice: monthlyRates.big,
    bagPrice: currentGrn.bagPrice,
  }), [currentGrn, sourceBagCategory, smallBags, bigBags, isHybrid, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice, movementDate, seasonalRates, monthlyRates]);

  const effectiveHamaliRate = useMemo(() => {
    if (typeof currentGrn.hamaliRate === 'number') return currentGrn.hamaliRate;
    const isApp = commodity?.isHamaliApplicable ?? ((commodity?.hamaliRate ?? 0) > 0);
    return isApp ? (commodity?.hamaliRate ?? 0) : 0;
  }, [currentGrn.hamaliRate, commodity]);
  const hamaliAmount = useMemo(() => {
    if (typeof currentGrn.hamaliAmount === 'number' && currentGrn.hamaliAmount >= 0) return currentGrn.hamaliAmount;
    return calculateHamaliAmount(currentGrn.bags, effectiveHamaliRate);
  }, [currentGrn.hamaliAmount, currentGrn.bags, effectiveHamaliRate]);

  const totalPaid = rentSummary?.totalPaid ?? 0;
  const pendingAmount = rentSummary?.remainingBalance ?? 0;
  const isUnbilled = totalPaid === 0 && pendingAmount === 0 && (rentSummary?.rentAmount ?? 0) === 0;
  const storedRent = rentSummary?.rentAmount ?? 0;
  const effectiveBaseRent = storedRent > 0 ? (storedRent > assessedRent ? storedRent : assessedRent) : assessedRent;

  const effectiveObligation = resolveTotalRentObligation({
    rentType: currentGrn.rentType, rentAmount: effectiveBaseRent,
    outwardRentCharges: 0, extensionAmounts: rentSummary?.extensions?.map((e) => e.finalAmount),
    hamaliShare: hamaliAmount,
  });
  const effectiveDue = Math.max(0, effectiveObligation - totalPaid);

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
    if (repackedSmallBags === '' && typeof confirmedSmallBags === 'number') setRepackedSmallBags(confirmedSmallBags);
    if (repackedBigBags === '' && typeof confirmedBigBags === 'number') setRepackedBigBags(confirmedBigBags);
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
