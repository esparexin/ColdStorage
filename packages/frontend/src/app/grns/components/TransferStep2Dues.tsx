'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type {
  Customer, Grn, OutwardBagCategory, PaymentMode, TransferPaymentDecision,
} from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { TransferOwnershipConfirmation } from './TransferOwnershipConfirmation';
import { TransferRentAssessment } from './TransferRentAssessment';
import { MovementSettlementDecisionSection } from './MovementSettlementDecisionSection';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

interface TransferStep2DuesProps {
  currentGrn: Grn;
  remainingBags: number;
  isUnverified: boolean;
  confirmedSmallBags: number | '';
  onSmallChange: (val: number | '') => void;
  confirmedBigBags: number | '';
  onBigChange: (val: number | '') => void;
  sourceBagCategory: OutwardBagCategory;
  onCategoryChange: (cat: OutwardBagCategory) => void;
  sourceBagPrice: number | '';
  onPriceChange: (p: number | '') => void;
  sourceSeasonalBagPrice: number | '';
  onSeasonalPriceChange: (p: number | '') => void;
  sourceMonthlyBagPrice: number | '';
  onMonthlyPriceChange: (p: number | '') => void;
  movementDate: string;
  selectedNewCustomer?: Customer;
  totalPaid: number;
  outstandingBalance: number;
  onAssessedRentChange: (rent: number) => void;
  effectiveDue: number;
  decision: TransferPaymentDecision;
  onDecisionChange: (d: TransferPaymentDecision) => void;
  settleAmount: number;
  onSettleAmountChange: (a: number) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (m: PaymentMode) => void;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function TransferStep2Dues(props: TransferStep2DuesProps) {
  const {
    currentGrn, remainingBags, isUnverified, confirmedSmallBags, onSmallChange,
    confirmedBigBags, onBigChange, sourceBagCategory, onCategoryChange,
    sourceBagPrice, onPriceChange, sourceSeasonalBagPrice, onSeasonalPriceChange,
    sourceMonthlyBagPrice, onMonthlyPriceChange, movementDate, selectedNewCustomer,
    totalPaid, outstandingBalance, onAssessedRentChange, effectiveDue,
    decision, onDecisionChange, settleAmount, onSettleAmountChange,
    paymentMode, onPaymentModeChange, submitting, onBack, onNext,
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Bag Type Confirmation Card (FIRST) */}
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Bag Type & Composition Confirmation</span>
          </span>
          <Badge variant="primary">Bag Confirmation First</Badge>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          Confirm stored bag type and composition FIRST before settling rent dues.
        </div>

        <TransferOwnershipConfirmation
          remainingBags={remainingBags}
          isUnverified={isUnverified}
          confirmedSmallBags={confirmedSmallBags}
          confirmedBigBags={confirmedBigBags}
          onSmallChange={onSmallChange}
          onBigChange={onBigChange}
          sourceBagCategory={sourceBagCategory}
          onCategoryChange={onCategoryChange}
          sourceBagPrice={sourceBagPrice}
          onPriceChange={onPriceChange}
          sourceSeasonalBagPrice={sourceSeasonalBagPrice}
          onSeasonalPriceChange={onSeasonalPriceChange}
          sourceMonthlyBagPrice={sourceMonthlyBagPrice}
          onMonthlyPriceChange={onMonthlyPriceChange}
          rentType={currentGrn.rentType}
          inwardDate={currentGrn.date}
          movementDate={movementDate}
          disabled={submitting}
        />

        <TransferRentAssessment
          currentGrn={currentGrn}
          remainingBags={remainingBags}
          movementDate={movementDate}
          sourceBagCategory={sourceBagCategory}
          sourceQuantity={remainingBags}
          sourceBagPrice={sourceBagPrice}
          sourceSeasonalBagPrice={sourceSeasonalBagPrice}
          sourceMonthlyBagPrice={sourceMonthlyBagPrice}
          confirmedSmallBags={confirmedSmallBags}
          confirmedBigBags={confirmedBigBags}
          newCustomerName={selectedNewCustomer?.name}
          totalPaid={totalPaid}
          outstandingBalance={outstandingBalance}
          onAssessedRentChange={onAssessedRentChange}
        />
      </div>

      {/* Rent Settlement Decision Card */}
      <MovementSettlementDecisionSection
        pendingAmount={effectiveDue}
        decision={decision}
        onDecisionChange={onDecisionChange}
        settleAmount={settleAmount}
        onSettleAmountChange={onSettleAmountChange}
        paymentMode={paymentMode}
        onPaymentModeChange={onPaymentModeChange}
        disabled={submitting}
        transfereeOrTargetName={selectedNewCustomer?.name}
        isTransfer
      />

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Transferee"
        onNext={onNext}
        nextLabel="Next: Review & Confirm"
        submitting={submitting}
      />
    </div>
  );
}
