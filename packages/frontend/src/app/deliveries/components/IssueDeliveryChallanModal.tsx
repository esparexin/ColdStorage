'use client';

import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import type { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { SelectedGrnCard } from './SelectedGrnCard';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
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
  onBackToGrn,
}: IssueDeliveryChallanModalProps) {
  const modalFooter = (
    <div className={styles.footerContainer}>
      <div className={styles.footerLeftActions}>
        {onBackToGrn && (
          <Button
            id="issue-modal-back-btn"
            variant="outline"
            onClick={onBackToGrn}
            disabled={form.submitting}
            leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
          >
            Back to Inward
          </Button>
        )}
        <Button id="issue-modal-cancel-btn" variant="outline" onClick={onClose} disabled={form.submitting}>
          Cancel
        </Button>
      </div>
      <div className={styles.footerRightActions}>
        <Button
          id="issue-panel-submit-delivery-btn"
          type="submit"
          variant={form.isLoanHoldActive ? 'danger' : 'primary'}
          disabled={!form.isFormValid || form.submitting || form.isLoanHoldActive}
          isLoading={form.submitting}
          leftIcon={!form.submitting ? <Plus size={15} aria-hidden="true" /> : undefined}
          onClick={(e) => void form.handleSubmit(e as unknown as React.FormEvent)}
        >
          {form.isLoanHoldActive ? 'Outward Blocked (Loan Active)' : '+ Delivery Challan'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue Outward Delivery Challan"
      size="xl"
      footer={modalFooter}
    >
      <form onSubmit={form.handleSubmit} className={styles.modalForm}>
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
            onChangeGrn={onChangeGrn ? onChangeGrn : () => void form.handleSelectGrn('')}
            bagCategory={form.bagCategory}
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
                bagType={form.selectedGrn.bagType}
                rentType={form.selectedGrn.rentType}
                rentMonths={form.billableRentMonths}
                smallBagPrice={form.selectedGrn.smallBagPrice ?? (form.selectedGrn.rentType === 'Monthly' ? form.monthlyCommodityRates?.small : form.seasonalCommodityRates?.small)}
                bigBagPrice={form.selectedGrn.bigBagPrice ?? (form.selectedGrn.rentType === 'Monthly' ? form.monthlyCommodityRates?.big : form.seasonalCommodityRates?.big)}
                bagPrice={form.selectedGrn.bagPrice}
                inwardDate={form.selectedGrn.date}
                deliveryDate={form.createDate}
                monthlyRates={form.monthlyCommodityRates}
                bagCategory={form.bagCategory}
                manualBagPrice={form.manualBagPrice}
                onManualBagPriceChange={form.setManualBagPrice}
                seasonalBagPrice={form.seasonalBagPrice}
                monthlyBagPrice={form.monthlyBagPrice}
                onSeasonalBagPriceChange={form.setSeasonalBagPrice}
                onMonthlyBagPriceChange={form.setMonthlyBagPrice}
                showSeasonalRate={form.rateVisibility.showSeasonalRate}
                showMonthlyRate={form.rateVisibility.showMonthlyRate}
                outwardRent={form.outwardRent}
                withdrawal={form.withdrawal}
                onQuantityChange={form.setWithdrawalQuantity}
                onSmallBagsChange={form.setWithdrawalSmallBags}
                onBigBagsChange={form.setWithdrawalBigBags}
                fieldErrors={form.fieldErrors}
                rentSummary={form.rentSummary}
                hamaliRate={form.hamaliRate}
              />
              <DeliveryTransportFields
                createDate={form.createDate}
                setCreateDate={form.setCreateDate}
                createVehicleNumber={form.createVehicleNumber}
                setCreateVehicleNumber={form.setCreateVehicleNumber}
                createGpNumber={form.createGpNumber}
                setCreateGpNumber={form.setCreateGpNumber}
                createDriverName={form.createDriverName}
                setCreateDriverName={form.setCreateDriverName}
                createWeight={form.createWeight}
                setCreateWeight={form.setCreateWeight}
                createRemarks={form.createRemarks}
                setCreateRemarks={form.setCreateRemarks}
                fieldErrors={form.fieldErrors}
              />
            </>
          )
        )}
      </form>
    </Modal>
  );
}
