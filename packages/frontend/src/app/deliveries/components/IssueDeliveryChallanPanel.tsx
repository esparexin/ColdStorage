'use client';

import React, { useEffect } from 'react';
import { Truck } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { EligibleGrnSection } from './EligibleGrnSection';
import { SelectedGrnCard } from './SelectedGrnCard';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
import pageStyles from '../page.module.css';
import styles from './IssueDeliveryChallanPanel.module.css';

export interface IssueDeliveryChallanPanelProps {
  facilityId: string;
  onCancel: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  loanClearedTick?: number;
  canClearLoan?: boolean;
  initialGrnId?: string;
}

export function IssueDeliveryChallanPanel({
  facilityId,
  onCancel,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
  onClearLoan,
  loanClearedTick = 0,
  canClearLoan = false,
  initialGrnId,
}: IssueDeliveryChallanPanelProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess, initialGrnId);
  const { createGrnId, refreshRentGate } = form;

  useEffect(() => {
    void form.fetchAvailableGrns();
  }, [form.fetchAvailableGrns]);

  useEffect(() => {
    if (loanClearedTick > 0 && createGrnId) void form.fetchAvailableGrns();
  }, [loanClearedTick, createGrnId, form.fetchAvailableGrns]);

  useEffect(() => {
    if (rentPaidTick > 0 && createGrnId) void refreshRentGate(facilityId, createGrnId);
  }, [rentPaidTick, createGrnId, facilityId, refreshRentGate]);

  return (
    <div className={styles.issuePanel}>
      <div className={styles.issueHeader}>
        <h2 className={styles.issueTitle}>Issue Outward Delivery Challan</h2>
        <p className={styles.issueSubtitle}>
          Select an active Inward GRN with available stock, configure bag composition, and enter transport details.
        </p>
      </div>

      <form onSubmit={form.handleSubmit} className={styles.formContent}>
        {form.modalError && (
          <Banner
            message={form.modalError}
            id="delivery-issue-error"
            action={
              canPayRent && form.rentSummary && form.rentSummary.remainingBalance > 0 ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onPayRent(form.rentSummary!)}
                >
                  Pay Rent Now
                </Button>
              ) : undefined
            }
          />
        )}

        {!form.selectedGrn ? (
          <>
            <EligibleGrnSection
              grns={form.availableGrns}
              selectedGrnId={form.createGrnId}
              onSelectGrn={(id) => void form.handleSelectGrn(id)}
            />
            <div className={styles.stockFooter}>
              <Button variant="outline" onClick={onCancel} disabled={form.submitting}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <SelectedGrnCard
              grn={form.selectedGrn}
              summary={form.grnSummary}
              onChangeGrn={() => void form.handleSelectGrn('')}
            />

            {form.isLoanHoldActive && form.selectedGrn && (
              <div id="issue-panel-loan-hold-banner" className={pageStyles.loanHoldBanner} role="alert">
                <strong>⚠️ Outward Blocked — Active Loan Hold Against GRN {form.selectedGrn.grnNumber}</strong>
                <div>
                  This commodity is pledged under GRN #{form.selectedGrn.grnNumber}.
                  Delivery challan generation is strictly blocked until the loan is marked as Cleared.
                </div>
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
              <>
                {form.isLoanHoldActive && form.selectedGrn && (
                  <Banner
                    variant="info"
                    id="issue-panel-loan-hold-guidance"
                    message="Complete the loan clearance above to continue — delivery details unlock after the hold is lifted."
                  />
                )}

                {form.grnSummary && form.selectedGrn && !form.isLoanHoldActive && (
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
                )}
              </>
            )}

            <div className={styles.footerContainer}>
              <div className={styles.footerRentSummary}>
                <span>Total Rent:</span>
                <span className={styles.footerRentAmount}>
                  ₹{form.outwardRent.toLocaleString('en-IN')}
                </span>
              </div>
              <div className={styles.footerActions}>
                <Button variant="outline" onClick={onCancel} disabled={form.submitting}>
                  Cancel
                </Button>
                <Button
                  id="issue-panel-submit-delivery-btn"
                  type="submit"
                  variant={form.isLoanHoldActive ? 'danger' : 'primary'}
                  disabled={form.submitting || form.isLoanHoldActive}
                  isLoading={form.submitting}
                  leftIcon={!form.submitting ? <Truck size={15} aria-hidden="true" /> : undefined}
                >
                  {form.isLoanHoldActive ? 'Outward Blocked (Loan Active)' : 'Issue Delivery Challan'}
                </Button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
