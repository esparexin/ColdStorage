'use client';

import React, { useEffect } from 'react';
import { Truck } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal, Select } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
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
            {form.modalError && <div className={styles.modalError}>{form.modalError}</div>}

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
                    {g.grnNumber} — {g.customerName} ({g.commodityName}, Chamber {g.chamber})
                  </option>
                ))}
              </Select>
            </div>

            {form.loadingGrnSummary || form.rentLoading ? (
              <FeedbackStates.Loading label="Checking stored positions..." />
            ) : (
              <>
                {(form.rentRequired || form.rentBlocked) && form.rentSummary && (
                  <div className={styles.modalError} role="alert">
                    Rent ₹{form.rentSummary.remainingBalance.toLocaleString('en-IN')} pending for {form.rentSummary.grnNumber}. Pay to issue challan — you will return here.
                    {canPayRent ? (
                      <Button variant="primary" onClick={() => onPayRent(form.rentSummary!)}>
                        Pay rent now
                      </Button>
                    ) : (
                      <span>Ask an operator to collect rent in Rent Billing.</span>
                    )}
                  </div>
                )}
                {form.rentPartial && form.rentSummary && !form.rentBlocked && !form.rentRequired && (
                  <div className={styles.fieldHint} role="status">
                    Partial rent paid (₹{form.rentSummary.totalPaid.toLocaleString('en-IN')}); ₹{form.rentSummary.remainingBalance.toLocaleString('en-IN')} remains. You may continue.
                  </div>
                )}
                {form.grnSummary && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <label htmlFor="delivery-bags" className={styles.fieldLabel}>
                    Bags to Deliver *
                  </label>
                  <span className={styles.fieldHint}>
                    {form.grnSummary.allocatedBags - form.grnSummary.unallocatedBags > 0
                      ? `${form.grnSummary.allocatedBags - form.grnSummary.unallocatedBags} bags of ${form.grnSummary.totalBags} received are in stock in chamber ${form.grnSummary.chamber}.`
                      : 'No bags of this GRN are in stock yet.'}
                  </span>
                  <input
                    id="delivery-bags"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={form.grnSummary.allocatedBags}
                    placeholder="Bags to deliver"
                    className={styles.fieldInput}
                    value={form.withdrawal.bags}
                    onChange={(e) =>
                      form.setWithdrawalBags(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                  />
                </div>

                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  Total Delivering:{' '}
                  <span style={{ color: 'var(--color-primary)' }}>{form.totalWithdrawingBags}</span> bags
                </div>

                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="delivery-date" className={styles.fieldLabel}>
                      Delivery Date *
                    </label>
                    <input
                      id="delivery-date"
                      type="date"
                      required
                      className={styles.fieldInput}
                      value={form.createDate}
                      onChange={(e) => form.setCreateDate(e.target.value)}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="delivery-vehicle" className={styles.fieldLabel}>
                      Vehicle Registration
                    </label>
                    <input aria-label="e.g. UP32AA1111"
                      id="delivery-vehicle"
                      type="text"
                      maxLength={15}
                      className={styles.fieldInput}
                      placeholder="e.g. UP32AA1111"
                      value={form.createVehicleNumber}
                      onChange={(e) => form.setCreateVehicleNumber(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className={styles.formGrid2}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="delivery-driver" className={styles.fieldLabel}>
                      Driver Name
                    </label>
                    <input aria-label="e.g. Ramesh Singh"
                      id="delivery-driver"
                      type="text"
                      maxLength={100}
                      className={styles.fieldInput}
                      placeholder="e.g. Ramesh Singh"
                      value={form.createDriverName}
                      onChange={(e) => form.setCreateDriverName(e.target.value)}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="delivery-weight" className={styles.fieldLabel}>
                      Dispatch Weight (kg)
                    </label>
                    <input aria-label="e.g. 12500"
                      id="delivery-weight"
                      type="number"
                      step="0.01"
                      min={0}
                      className={styles.fieldInput}
                      placeholder="e.g. 12500"
                      value={form.createWeight}
                      onChange={(e) =>
                        form.setCreateWeight(e.target.value ? parseFloat(e.target.value) : '')
                      }
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="delivery-remarks" className={styles.fieldLabel}>
                    Remarks / Gate Pass Notes
                  </label>
                  <input aria-label="Optional outward delivery notes"
                    id="delivery-remarks"
                    type="text"
                    maxLength={500}
                    className={styles.fieldInput}
                    placeholder="Optional outward delivery notes"
                    value={form.createRemarks}
                    onChange={(e) => form.setCreateRemarks(e.target.value)}
                  />
                </div>
              </>
            )}
              </>
            )}
          </div>

          <div className={styles.modalFooter}>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={form.submitting}
            >
              Cancel
            </Button>
            <Button
              id="submit-create-delivery-btn"
              type="submit"
              variant="primary"
              disabled={form.submitting || form.totalWithdrawingBags <= 0 || form.rentBlocked || !!form.rentRequired}
              isLoading={form.submitting}
              leftIcon={!form.submitting ? <Truck size={15} aria-hidden="true" /> : undefined}
            >
              {(form.rentBlocked || form.rentRequired) ? 'Rent payment required' : 'Issue Delivery Challan'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
