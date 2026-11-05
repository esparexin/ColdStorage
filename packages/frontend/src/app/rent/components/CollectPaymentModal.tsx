'use client';

import React, { useState } from 'react';
import type { DeliveryChallan, RentSummaryDto } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Modal, Select } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { RentSummaryOverview } from './RentSummaryOverview';
import { CollectPaymentModeInputs } from './CollectPaymentModeInputs';
import { useCollectPaymentForm } from '../hooks/useCollectPaymentForm';
import { getRentCollectionNotice } from '../hooks/rentDisplay.helper';
import { useGrnDeliveries } from '../hooks/useGrnDeliveries';
import styles from '../page.module.css';

interface CollectPaymentModalProps {
  account: RentSummaryDto;
  delivery?: DeliveryChallan | null;
  selectedFacilityId: string;
  canPrint: boolean;
  onClose: () => void;
  onPaymentSuccess: (summary?: RentSummaryDto) => void;
}

export function CollectPaymentModal({
  account,
  delivery: initialDelivery,
  selectedFacilityId,
  canPrint: _canPrint,
  onClose,
  onPaymentSuccess,
}: CollectPaymentModalProps) {
  const { deliveries } = useGrnDeliveries(selectedFacilityId, account.grnId);
  const unsettledDeliveries = deliveries.filter(
    (d) => d.status !== 'REVERSED' && (d.rentRemainingBalance ?? d.rentCharge ?? 0) > 0,
  );

  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>(initialDelivery?.id ?? '');
  const activeDelivery =
    unsettledDeliveries.find((d) => d.id === selectedDeliveryId) ?? initialDelivery ?? null;

  const {
    targetRemainingBalance,
    pendingAfterPayment,
    collectAmount,
    setCollectAmount,
    collectMode,
    setCollectMode,
    collectDate,
    setCollectDate,
    collectNotes,
    setCollectNotes,
    upiReference,
    setUpiReference,
    collectError,
    collectSubmitting,
    isDirty,
    handleSubmit,
  } = useCollectPaymentForm({
    account,
    delivery: activeDelivery,
    selectedFacilityId,
    onPaymentSuccess,
  });

  const { attemptExit, isConfirmOpen, confirmExit, cancelExit } = useUnsavedChanges(
    isDirty && !collectSubmitting,
  );

  const handleRequestClose = () => attemptExit(onClose);
  const notice = getRentCollectionNotice(account);

  return (
    <>
      <Modal
        isOpen
        onClose={handleRequestClose}
        title={
          activeDelivery
            ? `Collect Rent · Challan ${activeDelivery.challanNumber}`
            : 'Collect Rent & Issue Cash Memo'
        }
        subtitle={`${account.customerName} · ${account.grnNumber}${
          activeDelivery?.gpNumber ? ` · Gate Pass: ${activeDelivery.gpNumber}` : ''
        }`}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {collectError && <Banner message={collectError} id="collect-error" />}
            <RentSummaryOverview account={account} delivery={activeDelivery} />

            {unsettledDeliveries.length > 0 && !initialDelivery && (
              <Select
                id="collect-delivery-select"
                label="Allocate to Gate Pass / Delivery Challan"
                value={selectedDeliveryId}
                onChange={(e) => setSelectedDeliveryId(e.target.value)}
              >
                <option value="">
                  Consolidated GRN Balance (₹{account.remainingBalance.toLocaleString('en-IN')})
                </option>
                {unsettledDeliveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.challanNumber}
                    {d.gpNumber ? ` (${d.gpNumber})` : ''} · {d.totalBags} bags · ₹
                    {(d.rentRemainingBalance ?? d.rentCharge ?? 0).toLocaleString('en-IN')} Due
                  </option>
                ))}
              </Select>
            )}

            {notice && (
              <div
                style={{
                  padding: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-surface-2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {notice}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="collect-amount" className={styles.fieldLabel}>
                  Payment Amount (₹) *
                </label>
                {targetRemainingBalance > 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Pending After Payment: ₹{pendingAfterPayment.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <input
                id="collect-amount"
                type="number"
                min={0}
                max={targetRemainingBalance > 0 ? targetRemainingBalance : undefined}
                step="0.01"
                required
                disabled={targetRemainingBalance === 0}
                className={styles.fieldInput}
                placeholder={
                  targetRemainingBalance === 0 ? 'No outstanding dues' : 'Enter amount received'
                }
                value={collectAmount}
                aria-invalid={Boolean(collectError)}
                aria-describedby={collectError ? 'collect-error' : undefined}
                onChange={(e) =>
                  setCollectAmount(e.target.value !== '' ? parseFloat(e.target.value) : '')
                }
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.stopPropagation();
                  }
                }}
              />
            </div>

            <CollectPaymentModeInputs
              collectMode={collectMode}
              setCollectMode={setCollectMode}
              collectDate={collectDate}
              setCollectDate={setCollectDate}
              upiReference={upiReference}
              setUpiReference={setUpiReference}
              collectNotes={collectNotes}
              setCollectNotes={setCollectNotes}
            />
          </div>

          <div className={styles.modalFooter}>
            <Button
              variant="outline"
              onClick={handleRequestClose}
              disabled={collectSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="confirm-collect-payment-btn"
              type="submit"
              variant="primary"
              disabled={
                collectSubmitting ||
                typeof collectAmount !== 'number' ||
                collectAmount < 0
              }
              isLoading={collectSubmitting}
            >
              Collect & Issue Cash Memo
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Discard Unsaved Payment?"
        message="You have unsaved changes in the payment collection form. Discarding will close the form without recording any payment or issuing a Cash Memo."
        cancelLabel="Keep Editing"
        confirmLabel="Discard and Close"
        confirmVariant="danger"
        onCancel={cancelExit}
        onConfirm={confirmExit}
      />
    </>
  );
}
