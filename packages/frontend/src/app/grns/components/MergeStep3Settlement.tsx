'use client';

import React from 'react';
import type { PaymentMode, TransferPaymentDecision } from '@cold-storage/contracts';
import { MovementSettlementDecisionSection } from './MovementSettlementDecisionSection';
import { WizardStepActions } from './WizardStepActions';

interface MergeStep3SettlementProps {
  totalSourcePendingRent: number;
  settlementDecision: TransferPaymentDecision;
  onSettlementDecisionChange: (d: TransferPaymentDecision) => void;
  settleAmount: number;
  onSettleAmountChange: (amount: number) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  targetGrnNumber: string;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  isMultiSource?: boolean;
}

export function MergeStep3Settlement({
  totalSourcePendingRent,
  settlementDecision,
  onSettlementDecisionChange,
  settleAmount,
  onSettleAmountChange,
  paymentMode,
  onPaymentModeChange,
  targetGrnNumber,
  submitting,
  onBack,
  onNext,
  isMultiSource = false,
}: MergeStep3SettlementProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <MovementSettlementDecisionSection
        pendingAmount={totalSourcePendingRent}
        decision={settlementDecision}
        onDecisionChange={onSettlementDecisionChange}
        settleAmount={settleAmount}
        onSettleAmountChange={onSettleAmountChange}
        paymentMode={paymentMode}
        onPaymentModeChange={onPaymentModeChange}
        disabled={submitting}
        transfereeOrTargetName={targetGrnNumber}
        isTransfer={false}
        isMultiSource={isMultiSource}
      />

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Bag Type"
        onNext={onNext}
        nextLabel="Next: Repacking & Final Preview"
        submitting={submitting}
      />
    </div>
  );
}
