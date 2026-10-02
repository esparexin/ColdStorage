'use client';

import React, { useEffect } from 'react';
import { Truck, X } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import styles from '../page.module.css';

interface CreateDeliveryModalProps {
  facilityId: string;
  onClose: () => void;
  onSuccess: (newDelivery: DeliveryChallan) => void;
}

export function CreateDeliveryModal({
  facilityId,
  onClose,
  onSuccess,
}: CreateDeliveryModalProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess);

  useEffect(() => {
    void form.fetchAvailableGrns();
  }, [form.fetchAvailableGrns]);

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-delivery-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="create-delivery-title" className={styles.modalTitle}>
            Issue Outward Delivery Challan
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit}>
          <div className={styles.modalBody}>
            {form.modalError && <div className={styles.modalError}>{form.modalError}</div>}

            <div className={styles.fieldGroup}>
              <label htmlFor="delivery-grn" className={styles.fieldLabel}>
                Select Inward GRN *
              </label>
              <select
                id="delivery-grn"
                required
                className={styles.fieldSelect}
                value={form.createGrnId}
                onChange={(e) => void form.handleSelectGrn(e.target.value)}
              >
                <option value="">Select an active GRN with stored stock</option>
                {form.availableGrns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grnNumber} — {g.customerName} ({g.commodityName}, Chamber {g.chamberNumber})
                  </option>
                ))}
              </select>
            </div>

            {form.loadingGrnSummary ? (
              <FeedbackStates.Loading label="Checking stored positions..." />
            ) : form.grnSummary && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <span className={styles.fieldLabel}>Withdraw from Stored Positions *</span>
                  <span className={styles.fieldHint}>
                    Enter the number of bags to withdraw from each storage position.
                  </span>

                  {form.withdrawals.length === 0 ? (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}>
                      No bags are currently put-away in positions for this GRN.
                    </p>
                  ) : (
                    form.withdrawals.map((w, idx) => (
                      <div key={w.positionId} className={styles.positionRow}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                            {w.positionCode}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                            Available: {w.maxBags} bags
                          </span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={w.maxBags}
                          placeholder="Bags to withdraw"
                          className={styles.fieldInput}
                          value={w.bags}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : '';
                            form.setWithdrawals((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, bags: val } : item)),
                            );
                          }}
                        />
                      </div>
                    ))
                  )}
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
                    <input
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
                    <input
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
                    <input
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
                  <input
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
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={form.submitting}
            >
              Cancel
            </button>
            <button
              id="submit-create-delivery-btn"
              type="submit"
              className={styles.primaryBtn}
              disabled={form.submitting || form.totalWithdrawingBags <= 0}
            >
              <Truck size={15} aria-hidden="true" />
              {form.submitting ? 'Issuing...' : 'Issue Delivery Challan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
