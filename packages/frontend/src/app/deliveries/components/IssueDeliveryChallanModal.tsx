'use client';

import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { SelectedGrnCard } from './SelectedGrnCard';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
import pageStyles from '../page.module.css';
import styles from './IssueDeliveryChallanModal.module.css';

export interface IssueDeliveryChallanModalProps {
  facilityId: string;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  loanClearedTick?: number;
  canClearLoan?: boolean;
  initialGrnId?: string;
  onChangeGrn?: () => void;
}

export function IssueDeliveryChallanModal({
  facilityId,
  isOpen = true,
  onClose,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
  onClearLoan,
  loanClearedTick = 0,
  canClearLoan = false,
  initialGrnId,
  onChangeGrn,
}: IssueDeliveryChallanModalProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess, initialGrnId);
  const { createGrnId, refreshRentGate } = form;
  const [isConfirmingPayRent, setIsConfirmingPayRent] = useState(false);

  useEffect(() => {
    if (isOpen) void form.fetchAvailableGrns();
  }, [isOpen, form.fetchAvailableGrns]);

  useEffect(() => {
    if (loanClearedTick > 0 && createGrnId) void form.fetchAvailableGrns();
  }, [loanClearedTick, createGrnId, form.fetchAvailableGrns]);

  useEffect(() => {
    if (rentPaidTick > 0 && createGrnId) void refreshRentGate(facilityId, createGrnId);
  }, [rentPaidTick, createGrnId, facilityId, refreshRentGate]);

  const handlePayRentConfirm = () => {
    setIsConfirmingPayRent(false);
    if (form.rentSummary) {
      onPayRent(form.rentSummary);
    }
  };

  const modalFooter = (
    <div className={styles.footerContainer}>
      <Button variant="outline" onClick={onClose} disabled={form.submitting}>
        Cancel
      </Button>
      <div className={styles.footerRightActions}>
        {form.outwardRent > 0 && (
          <Button
            id="issue-panel-pay-rent-btn"
            type="button"
            variant="secondary"
            disabled={!form.isFormValid || form.submitting || form.isLoanHoldActive || !canPayRent}
            onClick={() => setIsConfirmingPayRent(true)}
          >
            Pay Rent: ₹{form.outwardRent.toLocaleString('en-IN')}
          </Button>
        )}
        <Button
          id="issue-panel-submit-delivery-btn"
          type="button"
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
    <>
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
                  smallBagPrice={form.selectedGrn.smallBagPrice}
                  bigBagPrice={form.selectedGrn.bigBagPrice}
                  bagPrice={form.selectedGrn.bagPrice}
                  inwardDate={form.selectedGrn.date}
                  deliveryDate={form.createDate}
                  monthlyRates={form.monthlyCommodityRates}
                  bagCategory={form.bagCategory}
                  onBagCategoryChange={form.setBagCategory}
                  outwardRent={form.outwardRent}
                  withdrawal={form.withdrawal}
                  onQuantityChange={form.setWithdrawalQuantity}
                  onSmallBagsChange={form.setWithdrawalSmallBags}
                  onBigBagsChange={form.setWithdrawalBigBags}
                  fieldErrors={form.fieldErrors}
                  rentSummary={form.rentSummary}
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

      {isConfirmingPayRent && (
        <ConfirmDialog
          isOpen={isConfirmingPayRent}
          title="Confirm Rent Payment & Delivery Challan"
          confirmLabel="Proceed to Payment"
          confirmVariant="primary"
          onCancel={() => setIsConfirmingPayRent(false)}
          onConfirm={handlePayRentConfirm}
          message={
            <div className={styles.confirmMessage}>
              <p>Initiate rent payment and outward delivery for GRN #{form.selectedGrn?.grnNumber}?</p>
              <div className={styles.confirmGrid}>
                <div className={styles.confirmRow}>
                  <span>Customer:</span>
                  <strong>{form.selectedGrn?.customerName}</strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Bags Dispatched:</span>
                  <strong>
                    {form.totalWithdrawingBags} bags ({form.withdrawal.smallBags || 0} Small, {form.withdrawal.bigBags || 0} Big)
                  </strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Vehicle:</span>
                  <strong>{form.createVehicleNumber}</strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Gate Pass:</span>
                  <strong>{form.createGpNumber}</strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Rent to Collect:</span>
                  <strong>₹{form.outwardRent.toLocaleString('en-IN')}</strong>
                </div>
              </div>
              <p>Confirming will proceed to payment recording and issue the delivery challan upon verified payment.</p>
            </div>
          }
        />
      )}
    </>
  );
}
