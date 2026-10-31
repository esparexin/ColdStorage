'use client';

import React from 'react';
import type { Commodity, Customer, Grn, OutwardBagCategory, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';
import { ConfirmDialog } from '@/components/ui';
import { WizardStepper } from './WizardStepper';
import { TransferStep1Customer } from './TransferStep1Customer';
import { TransferStep2Dues } from './TransferStep2Dues';
import { TransferStep3Repack } from './TransferStep3Repack';
import { TransferStep3Confirm } from './TransferStep3Confirm';
import { useInternalMovementTransferTab } from './useInternalMovementTransferTab';
import styles from './InternalMovementModal.module.css';

const TRANSFER_STEPS = [
  { number: 1, label: '1. Transferee' },
  { number: 2, label: '2. Dues' },
  { number: 3, label: '3. Repack & Chamber' },
  { number: 4, label: '4. Confirm' },
];

interface InternalMovementTransferTabProps {
  currentGrn: Grn;
  facilityId: string;
  customers: Customer[];
  commodities?: Commodity[];
  submitting: boolean;
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
  onCustomerAdded?: () => void;
}

export function InternalMovementTransferTab(props: InternalMovementTransferTabProps) {
  const { currentGrn, facilityId, submitting, onCustomerAdded } = props;
  const tab = useInternalMovementTransferTab(props);

  return (
    <form id="transfer-ownership-form" onSubmit={tab.handleTransferSubmit} className={styles.modalContent}>
      {tab.validationError && (
        <div role="alert" className={styles.noticeBox} style={{ color: 'var(--color-danger-text)', borderColor: 'var(--color-danger)' }}>
          {tab.validationError}
        </div>
      )}
      <WizardStepper steps={TRANSFER_STEPS} currentStep={tab.step} onStepClick={(s) => tab.setStep(s as 1 | 2 | 3 | 4)} canNavigateToStep={(s) => (s === 1 || Boolean(tab.newCustomerId))} disabled={submitting} />
      {tab.step === 1 && (
        <TransferStep1Customer
          currentGrn={currentGrn} remainingBags={tab.remainingBags} totalPaid={tab.totalPaid} pendingAmount={tab.pendingAmount}
          isUnbilled={tab.isUnbilled} rentLoading={tab.rentLoading} newCustomerId={tab.newCustomerId} onNewCustomerIdChange={tab.setNewCustomerId}
          candidateCustomers={tab.candidateCustomers} selectedNewCustomer={tab.selectedNewCustomer} submitting={submitting} onNext={tab.handleProceedToStep2}
          facilityId={facilityId}
          onCustomerAdded={(newCust) => {
            if (newCust) tab.setCreatedCustomers((prev) => [...prev, newCust]);
            onCustomerAdded?.();
          }}
        />
      )}
      {tab.step === 2 && (
        <TransferStep2Dues
          currentGrn={currentGrn} remainingBags={tab.remainingBags} isUnverified={tab.isUnverified} confirmedSmallBags={tab.confirmedSmallBags}
          onSmallChange={tab.setConfirmedSmallBags} confirmedBigBags={tab.confirmedBigBags} onBigChange={tab.setConfirmedBigBags}
          sourceBagCategory={tab.sourceBagCategory} onCategoryChange={tab.setSourceBagCategory} sourceBagPrice={tab.sourceBagPrice}
          onPriceChange={tab.setSourceBagPrice} sourceSeasonalBagPrice={tab.sourceSeasonalBagPrice} onSeasonalPriceChange={tab.setSourceSeasonalBagPrice}
          sourceMonthlyBagPrice={tab.sourceMonthlyBagPrice} onMonthlyPriceChange={tab.setSourceMonthlyBagPrice} movementDate={tab.movementDate}
          selectedNewCustomer={tab.selectedNewCustomer} totalPaid={tab.totalPaid} outstandingBalance={tab.effectiveDue}
          assessedRent={tab.assessedRent} effectiveDue={tab.effectiveDue} hamaliRate={tab.effectiveHamaliRate}
          seasonalRates={tab.seasonalRates} monthlyRates={tab.monthlyRates}
          decision={tab.decision} onDecisionChange={tab.setDecision}
          settleAmount={tab.settleAmount} onSettleAmountChange={tab.setSettleAmount} paymentMode={tab.paymentMode} onPaymentModeChange={tab.setPaymentMode}
          submitting={submitting} onBack={() => tab.setStep(1)} onNext={tab.handleProceedToStep3}
        />
      )}
      {tab.step === 3 && (
        <TransferStep3Repack
          currentChamber={currentGrn.chamber || ''}
          destinationChamber={tab.destinationChamber} onDestinationChamberChange={tab.setDestinationChamber}
          resultingBagType={tab.resultingBagType} onResultingBagTypeChange={tab.setResultingBagType}
          totalBags={tab.remainingBags}
          repackedSmallBags={tab.repackedSmallBags} onRepackedSmallChange={tab.setRepackedSmallBags}
          repackedBigBags={tab.repackedBigBags} onRepackedBigChange={tab.setRepackedBigBags}
          repackedQuantity={tab.repackedQuantity} onRepackedQuantityChange={tab.setRepackedQuantity}
          referenceWeight={tab.referenceWeight} onReferenceWeightChange={tab.setReferenceWeight}
          submitting={submitting} onBack={() => tab.setStep(2)} onNext={tab.handleProceedToStep4}
        />
      )}
      {tab.step === 4 && (
        <TransferStep3Confirm
          currentGrn={currentGrn} selectedNewCustomer={tab.selectedNewCustomer} remainingBags={tab.remainingBags}
          confirmedSmallBags={tab.resultingBagType === 'Hybrid' ? undefined : (typeof tab.repackedSmallBags === 'number' ? tab.repackedSmallBags : tab.confirmedSmallBags)}
          confirmedBigBags={tab.resultingBagType === 'Hybrid' ? undefined : (typeof tab.repackedBigBags === 'number' ? tab.repackedBigBags : tab.confirmedBigBags)}
          sourceBagCategory={tab.resultingBagType === 'Hybrid' ? 'Hybrid' : tab.sourceBagCategory}
          destinationChamber={tab.destinationChamber}
          referenceWeight={tab.referenceWeight}
          hamaliRate={tab.effectiveHamaliRate} hamaliAmount={tab.hamaliAmount}
          assessedRent={tab.assessedRent} totalPaid={tab.totalPaid} effectiveDue={tab.effectiveDue}
          decision={tab.decision} settleAmount={tab.settleAmount} movementDate={tab.movementDate}
          reason={tab.reason} onReasonChange={tab.setReason} remarks={tab.remarks} onRemarksChange={tab.setRemarks}
          submitting={submitting} onBack={() => tab.setStep(3)}
        />
      )}
      {tab.showConfirm && (
        <ConfirmDialog
          isOpen={tab.showConfirm}
          title="Confirm Ownership Transfer"
          message={
            <div>
              <p>Are you sure you want to transfer ownership of GRN <strong>{currentGrn.grnNumber}</strong> from <strong>{currentGrn.customerName}</strong> to <strong>{tab.selectedNewCustomer?.name}</strong>?</p>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                Once confirmed, the transfer will be finalized and this operation cannot be reversed.
              </p>
            </div>
          }
          confirmLabel="Yes, Transfer Ownership"
          confirmVariant="primary"
          isBusy={submitting}
          onCancel={() => tab.setShowConfirm(false)}
          onConfirm={async () => {
            tab.setShowConfirm(false);
            await tab.doExecuteTransfer();
          }}
        />
      )}
    </form>
  );
}
