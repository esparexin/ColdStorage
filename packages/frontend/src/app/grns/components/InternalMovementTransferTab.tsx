'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  isHybridBagCategory, resolveTotalRentObligation,
  type Customer, type Grn, type OutwardBagCategory, type PaymentMode,
  type TransferPaymentDecision, type TransferSettlementDetails,
} from '@cold-storage/contracts';
import { useRentGate } from '@/hooks/useRentGate';
import { ConfirmDialog } from '@/components/ui';
import { WizardStepper } from './WizardStepper';
import { computeOutwardRentCharge } from '@/app/deliveries/hooks/deliveryRent.helper';
import { validateTransferPayment } from './internalMovementPayload.helper';
import { validateTransferConfirmation } from './transferTabValidation.helper';
import { TransferStep1Customer } from './TransferStep1Customer';
import { TransferStep2Dues } from './TransferStep2Dues';
import { TransferStep3Confirm } from './TransferStep3Confirm';
import styles from './InternalMovementModal.module.css';

const TRANSFER_STEPS = [
  { number: 1, label: '1. Select Transferee' },
  { number: 2, label: '2. Confirm Bag Type & Dues' },
  { number: 3, label: '3. Confirm Transfer' },
];

interface InternalMovementTransferTabProps {
  currentGrn: Grn;
  facilityId: string;
  customers: Customer[];
  submitting: boolean;
  onExecuteTransfer: (
    newCustomerId: string, movementDate: string, reason: string, remarks?: string,
    paymentDecision?: TransferPaymentDecision, settlementDetails?: TransferSettlementDetails,
    confirmation?: {
      confirmedSmallBags?: number; confirmedBigBags?: number;
      sourceBagCategory?: OutwardBagCategory; sourceQuantity?: number;
      sourceBagPrice?: number; sourceSeasonalBagPrice?: number; sourceMonthlyBagPrice?: number;
    },
  ) => Promise<void>;
}

export function InternalMovementTransferTab({
  currentGrn, facilityId, customers, submitting, onExecuteTransfer,
}: InternalMovementTransferTabProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<TransferPaymentDecision>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [confirmedSmallBags, setConfirmedSmallBags] = useState<number | ''>('');
  const [confirmedBigBags, setConfirmedBigBags] = useState<number | ''>('');
  const [sourceBagCategory, setSourceBagCategory] = useState<OutwardBagCategory>(
    isHybridBagCategory(currentGrn.bagType) ? 'Hybrid' : 'S/B',
  );
  const [sourceBagPrice, setSourceBagPrice] = useState<number | ''>('');
  const [sourceSeasonalBagPrice, setSourceSeasonalBagPrice] = useState<number | ''>('');
  const [sourceMonthlyBagPrice, setSourceMonthlyBagPrice] = useState<number | ''>('');

  const { rentSummary, rentLoading, refreshRentGate } = useRentGate();
  useEffect(() => { void refreshRentGate(facilityId, currentGrn.id); }, [facilityId, currentGrn.id, refreshRentGate]);

  const candidateCustomers = useMemo(() => customers.filter((c) => c.id !== currentGrn.customerId && c.isActive), [customers, currentGrn.customerId]);
  const selectedNewCustomer = useMemo(() => candidateCustomers.find((c) => c.id === newCustomerId), [candidateCustomers, newCustomerId]);

  const remainingBags = currentGrn.closingBags ?? currentGrn.bags;
  const isUnverified = currentGrn.isCompositionVerified === false;
  const isHybrid = isHybridBagCategory(sourceBagCategory);
  const smallBags = isHybrid
    ? remainingBags
    : (typeof confirmedSmallBags === 'number' ? confirmedSmallBags : currentGrn.smallBags ?? 0);
  const bigBags = isHybrid ? 0 : (typeof confirmedBigBags === 'number' ? confirmedBigBags : currentGrn.bigBags ?? 0);

  const assessedRent = useMemo(() => {
    return computeOutwardRentCharge({
      rentType: currentGrn.rentType,
      bagCategory: (sourceBagCategory || 'S/B') as OutwardBagCategory,
      smallBags,
      bigBags,
      quantity: isHybrid ? smallBags : undefined,
      manualBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
      seasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
      monthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
      inwardDate: currentGrn.date,
      deliveryDate: movementDate,
      smallBagPrice: currentGrn.smallBagPrice,
      bigBagPrice: currentGrn.bigBagPrice,
      bagPrice: currentGrn.bagPrice,
    });
  }, [
    currentGrn, sourceBagCategory, smallBags, bigBags, isHybrid,
    sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice, movementDate,
  ]);

  const totalPaid = rentSummary?.totalPaid ?? 0;
  const pendingAmount = rentSummary?.remainingBalance ?? 0;
  const isUnbilled = totalPaid === 0 && pendingAmount === 0 && (rentSummary?.rentAmount ?? 0) === 0;
  const effectiveObligation = resolveTotalRentObligation({
    rentType: currentGrn.rentType, rentAmount: rentSummary?.rentAmount ?? 0,
    outwardRentCharges: assessedRent, extensionAmounts: rentSummary?.extensions?.map((e) => e.finalAmount),
  });
  const effectiveDue = isUnbilled ? assessedRent : Math.max(0, effectiveObligation - totalPaid);

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
    const isHybrid = isHybridBagCategory(sourceBagCategory);
    const confirmErr = validateTransferConfirmation({
      isUnverified, remainingBags, confirmedSmallBags, confirmedBigBags,
      sourceBagCategory, sourceQuantity: isHybrid ? remainingBags : undefined,
      sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
    });
    if (confirmErr) return setValidationError(confirmErr);
    setStep(3);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!newCustomerId) return setValidationError('Select the new customer to transfer ownership to.');
    if (remainingBags <= 0) return setValidationError('Cannot transfer ownership: No stock remaining in this GRN.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');

    const payErr = validateTransferPayment(decision, settleAmount, effectiveDue);
    if (payErr) return setValidationError(payErr);
    const isHybrid = isHybridBagCategory(sourceBagCategory);
    const confirmErr = validateTransferConfirmation({
      isUnverified, remainingBags, confirmedSmallBags, confirmedBigBags,
      sourceBagCategory, sourceQuantity: isHybrid ? remainingBags : undefined,
      sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
    });
    if (confirmErr) return setValidationError(confirmErr);

    setShowConfirm(true);
  };

  const doExecuteTransfer = async () => {
    const isHybrid = isHybridBagCategory(sourceBagCategory);
    const conf = isHybrid ? {
      sourceBagCategory: sourceBagCategory || undefined,
      sourceQuantity: remainingBags,
      sourceBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
      sourceSeasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
      sourceMonthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
    } : isUnverified && typeof confirmedSmallBags === 'number' && typeof confirmedBigBags === 'number'
      ? { confirmedSmallBags, confirmedBigBags } : undefined;

    await onExecuteTransfer(
      newCustomerId, movementDate, reason.trim(), remarks.trim() || undefined,
      effectiveDue > 0 ? decision : undefined,
      effectiveDue > 0 && decision === 'SETTLE_NOW' ? { amountPaid: settleAmount, paymentMode } : undefined,
      conf,
    );
  };

  return (
    <form id="transfer-ownership-form" onSubmit={handleTransferSubmit} className={styles.modalContent}>
      {validationError && (
        <div role="alert" className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {validationError}
        </div>
      )}
      <WizardStepper steps={TRANSFER_STEPS} currentStep={step} onStepClick={(s) => setStep(s as 1 | 2 | 3)} canNavigateToStep={(s) => (s === 1 || Boolean(newCustomerId))} disabled={submitting} />
      {step === 1 && (
        <TransferStep1Customer
          currentGrn={currentGrn} remainingBags={remainingBags} totalPaid={totalPaid} pendingAmount={pendingAmount}
          isUnbilled={isUnbilled} rentLoading={rentLoading} newCustomerId={newCustomerId} onNewCustomerIdChange={setNewCustomerId}
          candidateCustomers={candidateCustomers} selectedNewCustomer={selectedNewCustomer} submitting={submitting} onNext={handleProceedToStep2}
        />
      )}
      {step === 2 && (
        <TransferStep2Dues
          currentGrn={currentGrn} remainingBags={remainingBags} isUnverified={isUnverified} confirmedSmallBags={confirmedSmallBags}
          onSmallChange={setConfirmedSmallBags} confirmedBigBags={confirmedBigBags} onBigChange={setConfirmedBigBags}
          sourceBagCategory={sourceBagCategory} onCategoryChange={setSourceBagCategory} sourceBagPrice={sourceBagPrice}
          onPriceChange={setSourceBagPrice} sourceSeasonalBagPrice={sourceSeasonalBagPrice} onSeasonalPriceChange={setSourceSeasonalBagPrice}
          sourceMonthlyBagPrice={sourceMonthlyBagPrice} onMonthlyPriceChange={setSourceMonthlyBagPrice} movementDate={movementDate}
          selectedNewCustomer={selectedNewCustomer} totalPaid={totalPaid} outstandingBalance={effectiveDue}
          assessedRent={assessedRent} effectiveDue={effectiveDue} decision={decision} onDecisionChange={setDecision}
          settleAmount={settleAmount} onSettleAmountChange={setSettleAmount} paymentMode={paymentMode} onPaymentModeChange={setPaymentMode}
          submitting={submitting} onBack={() => setStep(1)} onNext={handleProceedToStep3}
        />
      )}
      {step === 3 && (
        <TransferStep3Confirm
          currentGrn={currentGrn} selectedNewCustomer={selectedNewCustomer} remainingBags={remainingBags}
          sourceBagCategory={sourceBagCategory} effectiveDue={effectiveDue} decision={decision} settleAmount={settleAmount}
          movementDate={movementDate} reason={reason} onReasonChange={setReason} remarks={remarks} onRemarksChange={setRemarks}
          submitting={submitting} onBack={() => setStep(2)}
        />
      )}
      {showConfirm && (
        <ConfirmDialog
          isOpen={showConfirm}
          title="Confirm Ownership Transfer"
          message={
            <div>
              <p>
                Are you sure you want to transfer ownership of GRN <strong>{currentGrn.grnNumber}</strong> from{' '}
                <strong>{currentGrn.customerName}</strong> to <strong>{selectedNewCustomer?.name}</strong>?
              </p>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                Once confirmed, the transfer will be finalized and this operation cannot be reversed.
              </p>
            </div>
          }
          confirmLabel="Yes, Transfer Ownership"
          confirmVariant="primary"
          isBusy={submitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={async () => {
            setShowConfirm(false);
            await doExecuteTransfer();
          }}
        />
      )}
    </form>
  );
}
