'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Grn, OutwardBagCategory, RentSummaryDto } from '@cold-storage/contracts';
import { isHybridBagCategory, toOperationalBagType } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import type { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { SelectedGrnCard } from './SelectedGrnCard';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
import { DeliveryConfirmSummary } from './DeliveryConfirmSummary';
import pageStyles from '../page.module.css';
import styles from './IssueDeliveryChallanModal.module.css';

export interface IssueDeliveryChallanModalProps {
  form: ReturnType<typeof useCreateDeliveryForm>;
  facilityId: string;
  isOpen?: boolean;
  onClose: () => void;
  onPayRent: (account: RentSummaryDto) => void;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  canClearLoan?: boolean;
  onChangeGrn?: () => void;
  /** @deprecated Modal now provides a single Cancel action. Kept optional for backward compatibility. */
  onBackToGrn?: () => void;
}

export function IssueDeliveryChallanModal({
  form,
  isOpen = true,
  onClose,
  onPayRent,
  canPayRent,
  onClearLoan,
  canClearLoan = false,
  onChangeGrn,
}: IssueDeliveryChallanModalProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);

  const hasUnsavedChanges = Boolean(
    form.totalWithdrawingBags > 0 || form.withdrawal.smallBags !== '' ||
    form.withdrawal.bigBags !== '' || form.withdrawal.quantity !== '' ||
    form.createVehicleNumber.trim() || form.createDriverName.trim() ||
    form.createWeight !== '' || form.createRemarks.trim() ||
    (form.manualBagPrice !== '' && form.manualBagPrice !== form.selectedGrn?.bagPrice),
  );

  const handleGuardedExit = (action?: () => void) => {
    if (!action) return;
    if (hasUnsavedChanges) {
      setPendingExitAction(() => action);
      setShowExitConfirm(true);
    } else {
      action();
    }
  };

  const handleAttemptSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (form.validateForm()) {
      setShowConfirm(true);
    }
  };

  const modalFooter = (
    <div className={styles.footerContainer}>
      <div className={styles.footerLeftActions}>
        <Button id="issue-modal-cancel-btn" variant="outline" onClick={() => handleGuardedExit(onClose)} disabled={form.submitting}>
          Cancel
        </Button>
      </div>
      <div className={styles.footerRightActions}>
        <Button
          id="issue-panel-submit-delivery-btn"
          type="button"
          variant={form.isLoanHoldActive ? 'danger' : 'primary'}
          disabled={!form.isFormValid || form.submitting || form.isLoanHoldActive}
          isLoading={form.submitting}
          leftIcon={!form.submitting ? <Plus size={15} aria-hidden="true" /> : undefined}
          onClick={() => handleAttemptSubmit()}
        >
          {form.isLoanHoldActive ? 'Outward Blocked (Loan Active)' : 'Delivery Challan'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => handleGuardedExit(onClose)}
      title="Issue Outward Delivery Challan"
      size="xl"
      footer={modalFooter}
    >
      <form onSubmit={handleAttemptSubmit} className={styles.modalForm}>
        {form.modalError && (
          <Banner
            message={form.modalError}
            id="delivery-issue-error"
            action={
              canPayRent && form.rentSummary && form.rentSummary.remainingBalance > 0 ? (
                <Button type="button" variant="primary" size="sm" onClick={() => onPayRent(form.rentSummary!)}>
                  Pay Rent Now
                </Button>
              ) : undefined
            }
          />
        )}

        {form.selectedGrn && (
          <SelectedGrnCard
            grn={form.selectedGrn}
            summary={form.grnSummary}
            rentSummary={form.rentSummary}
            onChangeGrn={onChangeGrn ? onChangeGrn : () => void form.handleSelectGrn('')}
            bagType={toOperationalBagType(form.bagCategory)}
            bagCategory={form.bagCategory}
            onBagTypeChange={(bt) => form.setBagCategory(bt as OutwardBagCategory)}
            onBagCategoryChange={form.setBagCategory}
          />
        )}

        {form.isLoanHoldActive && form.selectedGrn && (
          <div id="issue-panel-loan-hold-banner" className={pageStyles.loanHoldBanner} role="alert">
            <strong>⚠️ Outward Blocked — Active Loan Hold Against GRN {form.selectedGrn.grnNumber}</strong>
            <div>This commodity is pledged. Delivery challan generation is strictly blocked until loan is cleared.</div>
            {canClearLoan && onClearLoan && (
              <div className={pageStyles.loanHoldAction}>
                <Button
                  id="issue-panel-clear-loan-btn"
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onClearLoan(form.selectedGrn!)}
                >
                  Pay / Clear Loan
                </Button>
              </div>
            )}
          </div>
        )}

        {form.loadingGrnSummary || form.rentLoading ? (
          <FeedbackStates.Loading label={LOADING_LABELS.data} />
        ) : (
          form.grnSummary && form.selectedGrn && !form.isLoanHoldActive && (
            <>
              <DeliveryBagCompositionFields
                summary={form.grnSummary}
                bagType={isHybridBagCategory(form.bagCategory) ? 'Hybrid' : (isHybridBagCategory(form.selectedGrn.bagType) ? 'S/B' : form.selectedGrn.bagType)}
                rentType={form.selectedGrn.rentType} rentMonths={form.billableRentMonths}
                smallBagPrice={form.selectedGrn.smallBagPrice ?? (form.selectedGrn.rentType === 'Monthly' ? form.monthlyCommodityRates?.small : form.seasonalCommodityRates?.small)}
                bigBagPrice={form.selectedGrn.bigBagPrice ?? (form.selectedGrn.rentType === 'Monthly' ? form.monthlyCommodityRates?.big : form.seasonalCommodityRates?.big)}
                bagPrice={form.selectedGrn.bagPrice} inwardDate={form.selectedGrn.date} deliveryDate={form.createDate}
                seasonalRates={form.seasonalCommodityRates} monthlyRates={form.monthlyCommodityRates} bagCategory={form.bagCategory}
                manualBagPrice={form.manualBagPrice} onManualBagPriceChange={form.setManualBagPrice}
                seasonalBagPrice={form.seasonalBagPrice} monthlyBagPrice={form.monthlyBagPrice}
                onSeasonalBagPriceChange={form.setSeasonalBagPrice} onMonthlyBagPriceChange={form.setMonthlyBagPrice}
                showSeasonalRate={form.rateVisibility.showSeasonalRate} showMonthlyRate={form.rateVisibility.showMonthlyRate}
                outwardRent={form.outwardRent} withdrawal={form.withdrawal}
                onQuantityChange={form.setWithdrawalQuantity} onSmallBagsChange={form.setWithdrawalSmallBags} onBigBagsChange={form.setWithdrawalBigBags}
                fieldErrors={form.fieldErrors} rentSummary={form.rentSummary} hamaliRate={form.hamaliRate}
              />
              <DeliveryTransportFields
                createDate={form.createDate} setCreateDate={form.setCreateDate}
                createVehicleNumber={form.createVehicleNumber} setCreateVehicleNumber={form.setCreateVehicleNumber}
                createGpNumber={form.createGpNumber} setCreateGpNumber={form.setCreateGpNumber}
                createDriverName={form.createDriverName} setCreateDriverName={form.setCreateDriverName}
                createWeight={form.createWeight} setCreateWeight={form.setCreateWeight}
                createRemarks={form.createRemarks} setCreateRemarks={form.setCreateRemarks}
                fieldErrors={form.fieldErrors}
              />
            </>
          )
        )}
      </form>
      {showConfirm && form.selectedGrn && (
        <ConfirmDialog
          isOpen={showConfirm}
          title="Confirm Outward Delivery"
          size="md"
          message={
            <DeliveryConfirmSummary
              customerName={form.selectedGrn.customerName} grnNumber={form.selectedGrn.grnNumber}
              chamber={form.selectedGrn.chamber} commodityName={form.selectedGrn.commodityName}
              bagType={isHybridBagCategory(form.bagCategory) ? 'Hybrid' : form.selectedGrn.bagType}
              totalBags={form.totalWithdrawingBags}
              smallBags={Number(form.withdrawal.smallBags || 0)} bigBags={Number(form.withdrawal.bigBags || 0)}
              outwardRent={form.outwardRent} hamaliRate={form.hamaliRate}
              vehicleNumber={form.createVehicleNumber} gpNumber={form.createGpNumber}
              originalBags={form.selectedGrn.bags} totalHamaliAmount={form.selectedGrn.hamaliAmount}
              priorDeliveredBags={
                form.grnSummary
                  ? Math.max(0, form.selectedGrn.bags - (form.grnSummary.availableSmallBags + form.grnSummary.availableBigBags))
                  : undefined
              }
            />
          }
          confirmLabel="Yes, Issue Delivery"
          confirmVariant="primary"
          isBusy={form.submitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={async () => {
            try {
              await form.handleSubmit({ preventDefault: () => {} } as React.FormEvent);
            } finally {
              setShowConfirm(false);
            }
          }}
        />
      )}
      {showExitConfirm && (
        <ConfirmDialog
          isOpen={showExitConfirm}
          title="Unsaved Changes"
          message="Are you sure you want to go back? Any unsaved changes will be lost."
          cancelLabel="Stay on This Screen" confirmLabel="Yes, Go Back"
          confirmVariant="danger" confirmId="confirm-back-inward-btn" cancelId="cancel-back-inward-btn"
          onCancel={() => { setShowExitConfirm(false); setPendingExitAction(null); }}
          onConfirm={() => {
            setShowExitConfirm(false);
            const act = pendingExitAction;
            setPendingExitAction(null);
            act?.();
          }}
        />
      )}
    </Modal>
  );
}
