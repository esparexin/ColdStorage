'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  isHybridBagCategory,
  resolveTotalRentObligation,
  type Customer, type Grn, type TransferPaymentDecision, type TransferSettlementDetails,
} from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { useRentGate } from '@/hooks/useRentGate';
import { TransferPaymentDecisionSection, validateTransferPayment } from './TransferPaymentDecisionSection';
import { TransferOwnershipConfirmation } from './TransferOwnershipConfirmation';
import { TransferSummaryStrip } from './TransferSummaryStrip';
import { TransferRentAssessment } from './TransferRentAssessment';
import { validateTransferConfirmation } from './transferTabValidation.helper';
import styles from './InternalMovementModal.module.css';
interface InternalMovementTransferTabProps {
  currentGrn: Grn; facilityId: string; customers: Customer[]; submitting: boolean;
  onExecuteTransfer: (
    newCustomerId: string, movementDate: string, reason: string, remarks?: string,
    paymentDecision?: TransferPaymentDecision, settlementDetails?: TransferSettlementDetails,
    confirmation?: {
      confirmedSmallBags?: number; confirmedBigBags?: number;
      sourceBagCategory?: import('@cold-storage/contracts').OutwardBagCategory;
      sourceQuantity?: number; sourceBagPrice?: number;
      sourceSeasonalBagPrice?: number; sourceMonthlyBagPrice?: number;
    },
  ) => Promise<void>;
}

export function InternalMovementTransferTab({
  currentGrn, facilityId, customers, submitting, onExecuteTransfer,
}: InternalMovementTransferTabProps) {
  const [newCustomerId, setNewCustomerId] = useState('');
  const [movementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(''), [remarks, setRemarks] = useState('');
  const [decision, setDecision] = useState<'AGREED_PENDING' | 'SETTLE_NOW'>('AGREED_PENDING');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI'>('Cash');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmedSmallBags, setConfirmedSmallBags] = useState<number | ''>('');
  const [confirmedBigBags, setConfirmedBigBags] = useState<number | ''>('');
  const [sourceBagCategory, setSourceBagCategory] = useState<import('@cold-storage/contracts').OutwardBagCategory | ''>('');
  const [sourceQuantity, setSourceQuantity] = useState<number | ''>('');
  const [sourceBagPrice, setSourceBagPrice] = useState<number | ''>('');
  const [sourceSeasonalBagPrice, setSourceSeasonalBagPrice] = useState<number | ''>('');
  const [sourceMonthlyBagPrice, setSourceMonthlyBagPrice] = useState<number | ''>('');
  const [assessedRent, setAssessedRent] = useState<number>(0);

  const { rentSummary, rentLoading, refreshRentGate } = useRentGate();
  useEffect(() => { void refreshRentGate(facilityId, currentGrn.id); }, [facilityId, currentGrn.id, refreshRentGate]);

  const candidateCustomers = useMemo(() => customers.filter((c) => c.id !== currentGrn.customerId && c.isActive), [customers, currentGrn.customerId]);
  const selectedNewCustomer = useMemo(() => candidateCustomers.find((c) => c.id === newCustomerId), [candidateCustomers, newCustomerId]);

  const remainingBags = currentGrn.closingBags ?? currentGrn.bags;
  const isUnverified = (currentGrn as Record<string, unknown>).isCompositionVerified === false;
  const totalPaid = rentSummary?.totalPaid ?? 0, pendingAmount = rentSummary?.remainingBalance ?? 0;
  const isUnbilled = totalPaid === 0 && pendingAmount === 0 && (rentSummary?.rentAmount ?? 0) === 0;
  const effectiveObligation = resolveTotalRentObligation({
    rentType: currentGrn.rentType, rentAmount: rentSummary?.rentAmount ?? 0,
    outwardRentCharges: assessedRent, extensionAmounts: rentSummary?.extensions?.map((e) => e.finalAmount),
  });
  const outstandingBalance = isUnbilled ? assessedRent : Math.max(0, effectiveObligation - totalPaid);
  const effectiveDue = outstandingBalance;

  useEffect(() => {
    if (effectiveDue > 0 && settleAmount === 0) setSettleAmount(effectiveDue);
  }, [effectiveDue, settleAmount]);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!newCustomerId) return setValidationError('Select the new customer to transfer ownership to.');
    if (reason.trim().length < 5) return setValidationError('Audit reason must be at least 5 characters.');
    const payErr = validateTransferPayment(decision, settleAmount, effectiveDue);
    if (payErr) return setValidationError(payErr);
    const confirmErr = validateTransferConfirmation({
      isUnverified, remainingBags, confirmedSmallBags, confirmedBigBags,
      sourceBagCategory, sourceQuantity, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
    });
    if (confirmErr) return setValidationError(confirmErr);
    const isHybrid = isHybridBagCategory(sourceBagCategory);
    const confirmation = isHybrid
      ? {
          sourceBagCategory: sourceBagCategory || undefined,
          sourceQuantity: typeof sourceQuantity === 'number' ? sourceQuantity : undefined,
          sourceBagPrice: typeof sourceBagPrice === 'number' ? sourceBagPrice : undefined,
          sourceSeasonalBagPrice: typeof sourceSeasonalBagPrice === 'number' ? sourceSeasonalBagPrice : undefined,
          sourceMonthlyBagPrice: typeof sourceMonthlyBagPrice === 'number' ? sourceMonthlyBagPrice : undefined,
        }
      : isUnverified && typeof confirmedSmallBags === 'number' && typeof confirmedBigBags === 'number'
        ? { confirmedSmallBags, confirmedBigBags } : undefined;

    await onExecuteTransfer(
      newCustomerId, movementDate, reason.trim(), remarks.trim() || undefined,
      effectiveDue > 0 ? decision : undefined,
      effectiveDue > 0 && decision === 'SETTLE_NOW' ? { amountPaid: settleAmount, paymentMode } : undefined,
      confirmation,
    );
  };

  return (
    <form id="transfer-ownership-form" onSubmit={handleTransferSubmit} className={styles.modalContent}>
      {validationError && (
        <div className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>{validationError}</div>
      )}

      {/* Current Owner & GRN Compact Summary Strip */}
      <TransferSummaryStrip
        currentGrn={currentGrn}
        remainingBags={remainingBags}
        totalPaid={totalPaid}
        pendingAmount={pendingAmount}
        isUnbilled={isUnbilled}
        rentLoading={rentLoading}
      />

      <TransferPaymentDecisionSection
        pendingAmount={effectiveDue} decision={decision} onDecisionChange={setDecision}
        settleAmount={settleAmount} onSettleAmountChange={setSettleAmount}
        paymentMode={paymentMode} onPaymentModeChange={setPaymentMode} disabled={submitting}
      />

      {/* Transfer Specification & Governance Grid */}
      <div className={styles.reviewGrid}>
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>1. New Owner Assignment</span>
            <Badge variant="primary">Transfer</Badge>
          </div>
          <Select
            id="new-customer-selector"
            label="Select New Customer *"
            value={newCustomerId}
            onChange={(e) => setNewCustomerId(e.target.value)}
            disabled={submitting}
            required
          >
            <option value="">-- Choose New Owner --</option>
            {candidateCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className={styles.formSection}>
            <label htmlFor="transfer-movement-date" className={styles.inputLabel}>
              Movement Date *
            </label>
            <Input
              id="transfer-movement-date"
              type="date"
              value={movementDate}
              readOnly
              disabled={submitting}
              aria-label="Movement Date (read-only)"
              title="Authoritative operational date"
              required
            />
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Assigned Transferee:</span>
            <span className={styles.detailValue}>{selectedNewCustomer ? selectedNewCustomer.name : '—'}</span>
          </div>

          <TransferOwnershipConfirmation
            remainingBags={remainingBags} isUnverified={isUnverified}
            confirmedSmallBags={confirmedSmallBags} confirmedBigBags={confirmedBigBags}
            onSmallChange={setConfirmedSmallBags} onBigChange={setConfirmedBigBags}
            sourceBagCategory={sourceBagCategory} onCategoryChange={setSourceBagCategory}
            sourceQuantity={sourceQuantity} onQuantityChange={setSourceQuantity}
            sourceBagPrice={sourceBagPrice} onPriceChange={setSourceBagPrice}
            sourceSeasonalBagPrice={sourceSeasonalBagPrice} onSeasonalPriceChange={setSourceSeasonalBagPrice}
            sourceMonthlyBagPrice={sourceMonthlyBagPrice} onMonthlyPriceChange={setSourceMonthlyBagPrice}
            rentType={currentGrn.rentType} inwardDate={currentGrn.date} movementDate={movementDate}
            disabled={submitting}
          />

          <div className={styles.noticeBox}>
            {effectiveDue > 0
              ? decision === 'SETTLE_NOW'
                ? `Rent (₹${settleAmount}) will be settled now with receipt generated.`
                : `Transferee agreed to assume pending rent: ₹${effectiveDue.toLocaleString('en-IN')}.`
              : 'Rent obligation is fully settled for this lot.'}
          </div>
        </div>

        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>2. Governance & Audit</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>*Required</span>
          </div>

          <div className={styles.formSection}>
            <label htmlFor="transfer-reason" className={styles.inputLabel}>
              Audit Reason (min 5 chars) *
            </label>
            <Input
              id="transfer-reason"
              placeholder="e.g. Sale of lot / Farmer transfer"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className={styles.formSection}>
            <label htmlFor="transfer-remarks" className={styles.inputLabel}>
              Additional Remarks (Optional)
            </label>
            <textarea
              id="transfer-remarks"
              aria-label="Additional Remarks"
              rows={2}
              className={styles.textarea}
              placeholder="Internal notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.noticeBox}>
            New owner must clear all outstanding GRN obligations prior to dispatch/delivery.
          </div>
        </div>
      </div>

      <TransferRentAssessment
        currentGrn={currentGrn}
        remainingBags={remainingBags}
        movementDate={movementDate}
        sourceBagCategory={sourceBagCategory}
        sourceQuantity={sourceQuantity} sourceBagPrice={sourceBagPrice}
        sourceSeasonalBagPrice={sourceSeasonalBagPrice} sourceMonthlyBagPrice={sourceMonthlyBagPrice}
        confirmedSmallBags={confirmedSmallBags} confirmedBigBags={confirmedBigBags}
        newCustomerName={selectedNewCustomer?.name} totalPaid={totalPaid}
        outstandingBalance={outstandingBalance} onAssessedRentChange={setAssessedRent}
      />
    </form>
  );
}
