'use client';

import React, { useEffect } from 'react';
import { IndianRupee, Truck } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
import pageStyles from '../page.module.css';
import styles from './CreateDeliveryModal.module.css';

interface CreateDeliveryModalProps {
  facilityId: string;
  onClose: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  loanClearedTick?: number;
  canClearLoan?: boolean;
  initialGrnId?: string;
}

export function CreateDeliveryModal({
  facilityId,
  onClose,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
  onClearLoan,
  loanClearedTick = 0,
  canClearLoan = false,
  initialGrnId,
}: CreateDeliveryModalProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess, initialGrnId);
  const { createGrnId, clearRentRequired, refreshRentGate } = form;

  useEffect(() => {
    void form.fetchAvailableGrns();
  }, [form.fetchAvailableGrns]);

  useEffect(() => {
    if (loanClearedTick > 0 && createGrnId) {
      void form.fetchAvailableGrns();
    }
  }, [loanClearedTick, createGrnId, form.fetchAvailableGrns]);

  useEffect(() => {
    if (rentPaidTick > 0 && createGrnId) {
      clearRentRequired();
      void refreshRentGate(facilityId, createGrnId);
    }
  }, [rentPaidTick, createGrnId, facilityId, clearRentRequired, refreshRentGate]);

  const grnError = form.fieldErrors.grn;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Issue Outward Delivery Challan"
      size="lg"
    >
      <form onSubmit={form.handleSubmit}>
        <div className={pageStyles.modalBody}>
          {form.modalError && (
            <Banner
              message={form.modalError}
              id="delivery-modal-error"
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

          <div className={pageStyles.fieldGroup}>
            <Select
              id="delivery-grn"
              label="Select Inward GRN"
              required
              value={form.createGrnId}
              onChange={(e) => void form.handleSelectGrn(e.target.value)}
            >
              <option value="">Select an active GRN with stored stock</option>
              {form.availableGrns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.loanStatus === 'TAKEN' ? '🔒 [LOAN HOLD] ' : ''}
                  {g.grnNumber} — {g.customerName} ({g.commodityName}, Chamber {g.chamber})
                  {g.loanStatus === 'TAKEN' ? ' [Pledged]' : ''}
                </option>
              ))}
            </Select>
            {grnError && <span className={styles.fieldErrorText}>{grnError}</span>}
          </div>

          {form.selectedGrn && (
            <div className={styles.grnDetailsGrid}>
              <div className={styles.grnDetailItem}>
                <span className={styles.detailLabel}>GRN Number</span>
                <strong className={styles.detailValue}>
                  {form.selectedGrn.grnNumber}
                </strong>
              </div>
              <div className={styles.grnDetailItem}>
                <span className={styles.detailLabel}>Storage Mark</span>
                <span className={styles.detailValue}>
                  {/*
                    The Inward Form shows Storage Mark as a read-only mirror of the GR Number
                    and never stores a separate value, so fall back to the GR Number exactly
                    like the GRN detail view does instead of rendering a bare dash.
                  */}
                  {form.selectedGrn.storageMark || form.selectedGrn.grnNumber}
                </span>
              </div>
              <div className={styles.grnDetailItem}>
                <span className={styles.detailLabel}>Party Mark</span>
                <span className={styles.detailValue}>
                  {form.selectedGrn.partyMark || '—'}
                </span>
              </div>
              <div className={styles.grnDetailItem}>
                <span className={styles.detailLabel}>Received</span>
                <span className={styles.detailValue}>
                  {form.selectedGrn.bags.toLocaleString('en-IN')} bags
                </span>
              </div>
            </div>
          )}

          {form.isLoanHoldActive && form.selectedGrn && (
            <div id="loan-hold-banner" className={pageStyles.loanHoldBanner} role="alert">
              <strong>⚠️ Outward Blocked — Active Loan Hold Against GRN {form.selectedGrn.grnNumber}</strong>
              <div>
                This commodity is pledged under GRN #{form.selectedGrn.grnNumber}.
                Delivery challan generation is strictly blocked until the loan is marked as Cleared.
              </div>
              {canClearLoan && onClearLoan && (
                <div className={pageStyles.loanHoldAction}>
                  <Button
                    id="clear-loan-from-delivery-btn"
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
              {form.rentSummary && form.rentSummary.remainingBalance > 0 && (
                <div className={styles.pendingRentCard} role="status">
                  <div className={styles.pendingRentText}>
                    <span className={styles.pendingRentTitle}>
                      Pending Rent for {form.rentSummary.grnNumber}: ₹{form.rentSummary.remainingBalance.toLocaleString('en-IN')}
                      {form.rentSummary.totalPaid > 0 ? ` (₹${form.rentSummary.totalPaid.toLocaleString('en-IN')} paid)` : ''}
                    </span>
                    <span className={styles.pendingRentSub}>
                      Challan can be issued; rent remains payable in Rent Billing.
                    </span>
                  </div>
                  {canPayRent && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onPayRent(form.rentSummary!)}
                      leftIcon={<IndianRupee size={12} aria-hidden="true" />}
                    >
                      Pay Rent Now
                    </Button>
                  )}
                </div>
              )}

              {form.grnSummary && form.selectedGrn && (
                <>
                  <DeliveryBagCompositionFields
                    summary={form.grnSummary}
                    bagType={form.selectedGrn.bagType}
                    withdrawal={form.withdrawal}
                    onQuantityChange={form.setWithdrawalQuantity}
                    onSmallBagsChange={form.setWithdrawalSmallBags}
                    onBigBagsChange={form.setWithdrawalBigBags}
                    fieldErrors={form.fieldErrors}
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
        </div>

        <div className={pageStyles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={form.submitting}>
            Cancel
          </Button>
          <Button
            id="submit-create-delivery-btn"
            type="submit"
            variant={form.isLoanHoldActive ? 'danger' : 'primary'}
            disabled={form.submitting || form.isLoanHoldActive}
            isLoading={form.submitting}
            leftIcon={!form.submitting ? <Truck size={15} aria-hidden="true" /> : undefined}
          >
            {form.isLoanHoldActive ? 'Outward Blocked (Loan Active)' : 'Issue Delivery Challan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
