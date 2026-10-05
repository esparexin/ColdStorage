'use client';

import React, { useEffect } from 'react';
import { Truck } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { DeliveryBagCompositionFields } from './DeliveryBagCompositionFields';
import { DeliveryTransportFields } from './DeliveryTransportFields';
import styles from '../page.module.css';

interface CreateDeliveryModalProps {
  facilityId: string;
  onClose: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
}

export function CreateDeliveryModal({
  facilityId,
  onClose,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
}: CreateDeliveryModalProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess);
  const { createGrnId, clearRentRequired, refreshRentGate } = form;

  useEffect(() => {
    void form.fetchAvailableGrns();
  }, [form.fetchAvailableGrns]);

  useEffect(() => {
    if (rentPaidTick > 0 && createGrnId) {
      clearRentRequired();
      void refreshRentGate(facilityId, createGrnId);
    }
  }, [rentPaidTick, createGrnId, facilityId, clearRentRequired, refreshRentGate]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Issue Outward Delivery Challan"
      size="lg"
    >
      <form onSubmit={form.handleSubmit}>
          <div className={styles.modalBody}>
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

            <div className={styles.fieldGroup}>
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
                    {g.loanStatus === 'TAKEN' ? ` [Pledged: ${g.loanBankName || 'Bank'}]` : ''}
                  </option>
                ))}
              </Select>
            </div>

            {form.isLoanHoldActive && form.selectedGrn && (
              <div id="loan-hold-banner" className={styles.loanHoldBanner} role="alert">
                <strong>⚠️ Outward Blocked — Active Loan Hold Against This Bond</strong>
                <div>
                  This commodity is pledged under Bond {form.selectedGrn.grnNumber}
                  {form.selectedGrn.loanBankName ? ` (${form.selectedGrn.loanBankName}` : ''}
                  {form.selectedGrn.loanReferenceNumber ? ` · Ref: ${form.selectedGrn.loanReferenceNumber}` : ''}
                  {form.selectedGrn.loanBankName ? ')' : ''}.
                  Delivery challan generation is strictly blocked until the loan is marked as Cleared.
                </div>
              </div>
            )}

            {form.loadingGrnSummary || form.rentLoading ? (
              <FeedbackStates.Loading label={LOADING_LABELS.data} />
            ) : (
              <>
                {form.rentSummary && form.rentSummary.remainingBalance > 0 && (
                  <div className={styles.fieldHint} role="status">
                    Pending rent for {form.rentSummary.grnNumber}: ₹{form.rentSummary.remainingBalance.toLocaleString('en-IN')}
                    {form.rentSummary.totalPaid > 0 ? ` (₹${form.rentSummary.totalPaid.toLocaleString('en-IN')} paid)` : ''}.
                    Challan can be issued; rent remains payable in Rent Billing.
                    {canPayRent && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onPayRent(form.rentSummary!)}>
                        Pay rent now
                      </Button>
                    )}
                  </div>
                )}
                {form.grnSummary && (
                  <>
                    <DeliveryBagCompositionFields
                      summary={form.grnSummary}
                      withdrawal={form.withdrawal}
                      onSmallBagsChange={form.setWithdrawalSmallBags}
                      onBigBagsChange={form.setWithdrawalBigBags}
                    />

                    <DeliveryTransportFields
                      createDate={form.createDate}
                      setCreateDate={form.setCreateDate}
                      createVehicleNumber={form.createVehicleNumber}
                      setCreateVehicleNumber={form.setCreateVehicleNumber}
                      createMarks={form.createMarks}
                      setCreateMarks={form.setCreateMarks}
                      createGpNumber={form.createGpNumber}
                      setCreateGpNumber={form.setCreateGpNumber}
                      createDriverName={form.createDriverName}
                      setCreateDriverName={form.setCreateDriverName}
                      createWeight={form.createWeight}
                      setCreateWeight={form.setCreateWeight}
                      createRemarks={form.createRemarks}
                      setCreateRemarks={form.setCreateRemarks}
                    />
                  </>
                )}
              </>
            )}
          </div>

          <div className={styles.modalFooter}>
            <Button variant="outline" onClick={onClose} disabled={form.submitting}>
              Cancel
            </Button>
            <Button
              id="submit-create-delivery-btn"
              type="submit"
              variant={form.isLoanHoldActive ? 'danger' : 'primary'}
              disabled={form.submitting || form.totalWithdrawingBags <= 0 || form.isLoanHoldActive}
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
