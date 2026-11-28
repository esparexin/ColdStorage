'use client';

import React from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import type {
  Customer, Grn, OutwardBagCategory, PaymentMode, TransferPaymentDecision,
} from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
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
  assessedRent?: number;
  effectiveDue: number;
  hamaliRate?: number | null;
  seasonalRates?: { small: number; big: number };
  monthlyRates?: { small: number; big: number };
  decision: TransferPaymentDecision;
  onDecisionChange: (d: TransferPaymentDecision) => void;
  settleAmount: number;
  onSettleAmountChange: (a: number) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (m: PaymentMode) => void;
  transferFeePerBag: number | '';
  onTransferFeePerBagChange: (val: number | '') => void;
  feePaidBy: 'BUYER' | 'SELLER';
  onFeePaidByChange: (val: 'BUYER' | 'SELLER') => void;
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
    totalPaid, outstandingBalance, assessedRent, effectiveDue, hamaliRate,
    seasonalRates, monthlyRates,
    decision, onDecisionChange, settleAmount, onSettleAmountChange,
    paymentMode, onPaymentModeChange,
    transferFeePerBag, onTransferFeePerBagChange, feePaidBy, onFeePaidByChange,
    submitting, onBack, onNext,
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Bag Details Card */}
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Bag Details</span>
          </span>
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
      </div>

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
        assessedRent={assessedRent}
        hamaliRate={hamaliRate}
        seasonalRates={seasonalRates}
        monthlyRates={monthlyRates}
      />

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

      {/* Transfer Service Fee & Invoicing Card */}
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} aria-hidden="true" />
            <span>Transfer Service Fee &amp; Receipt Invoicing</span>
          </span>
          <Badge variant="neutral">Service Fee</Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-2)' }}>
          <Input
            id="transfer-fee-per-bag"
            label="Transfer Fee (₹ / Bag)"
            type="number"
            min="0"
            step="0.5"
            placeholder="e.g. 2.00 (Optional)"
            value={transferFeePerBag}
            onChange={(e) => onTransferFeePerBagChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={submitting}
          />

          <Select
            id="transfer-fee-payer"
            label="Fee Payer"
            value={feePaidBy}
            onChange={(e) => onFeePaidByChange(e.target.value as 'BUYER' | 'SELLER')}
            disabled={submitting}
          >
            <option value="BUYER">Transferee (Buyer: {selectedNewCustomer?.name || 'New Owner'})</option>
            <option value="SELLER">Transferor (Seller: {currentGrn.customerName})</option>
          </Select>

          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total Transfer Fee</span>
            <div style={{ padding: 'var(--space-2)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-primary)' }}>
              {typeof transferFeePerBag === 'number' && transferFeePerBag > 0
                ? `₹${(transferFeePerBag * remainingBags).toLocaleString('en-IN')} (${remainingBags} bags @ ₹${transferFeePerBag}/bag)`
                : '₹0.00 (Waived)'}
            </div>
          </div>
        </div>
      </div>

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
