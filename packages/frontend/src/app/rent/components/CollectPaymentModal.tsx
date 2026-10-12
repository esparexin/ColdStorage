'use client';

import React from 'react';
import { CreditCard, Wallet } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { Button, ConfirmDialog, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { RentSummaryOverview } from './RentSummaryOverview';
import { useCollectPaymentForm } from '../hooks/useCollectPaymentForm';
import { getRentCollectionNotice } from '../hooks/rentDisplay.helper';
import styles from '../page.module.css';

interface CollectPaymentModalProps {
  account: RentSummaryDto;
  selectedFacilityId: string;
  canPrint: boolean;
  onClose: () => void;
  onPaymentSuccess: (summary?: RentSummaryDto) => void;
}

export function CollectPaymentModal({
  account,
  selectedFacilityId,
  canPrint: _canPrint,
  onClose,
  onPaymentSuccess,
}: CollectPaymentModalProps) {
  const {
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
        title="Collect Rent & Issue Cash Memo"
        subtitle={`${account.customerName} · ${account.grnNumber}`}
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {collectError && <Banner message={collectError} id="collect-error" />}
            <RentSummaryOverview account={account} />
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
                {account.remainingBalance > 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Pending After Payment: ₹{pendingAfterPayment.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <input
                id="collect-amount"
                type="number"
                min={0}
                max={account.remainingBalance > 0 ? account.remainingBalance : undefined}
                step="0.01"
                required
                disabled={account.remainingBalance === 0}
                className={styles.fieldInput}
                placeholder={account.remainingBalance === 0 ? 'No outstanding dues' : 'Enter amount received'}
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

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel} id="payment-mode-label">
                Payment Mode *
              </span>
              <div
                className={styles.modeToggleGroup}
                role="radiogroup"
                aria-labelledby="payment-mode-label"
              >
                <Button
                  type="button"
                  role="radio"
                  aria-checked={collectMode === 'Cash'}
                  variant={collectMode === 'Cash' ? 'primary' : 'outline'}
                  className={`${styles.modeOption} ${collectMode === 'Cash' ? styles.modeOptionActive : ''}`}
                  onClick={() => setCollectMode('Cash')}
                  leftIcon={<Wallet size={16} aria-hidden="true" />}
                >
                  Cash
                </Button>
                <Button
                  type="button"
                  role="radio"
                  aria-checked={collectMode === 'UPI'}
                  variant={collectMode === 'UPI' ? 'primary' : 'outline'}
                  className={`${styles.modeOption} ${collectMode === 'UPI' ? styles.modeOptionActive : ''}`}
                  onClick={() => setCollectMode('UPI')}
                  leftIcon={<CreditCard size={16} aria-hidden="true" />}
                >
                  UPI
                </Button>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="collect-date" className={styles.fieldLabel}>
                Payment Date *
              </label>
              <input
                id="collect-date"
                type="date"
                required
                className={styles.fieldInput}
                value={collectDate}
                onChange={(e) => setCollectDate(e.target.value)}
              />
            </div>

            {collectMode === 'UPI' && (
              <div className={styles.fieldGroup}>
                <label htmlFor="collect-upi-ref" className={styles.fieldLabel}>
                  UPI Transaction ID / Reference *
                </label>
                <input
                  id="collect-upi-ref"
                  type="text"
                  required
                  maxLength={100}
                  className={styles.fieldInput}
                  placeholder="e.g. UPI1234567890 or Bank Ref"
                  value={upiReference}
                  onChange={(e) => setUpiReference(e.target.value)}
                />
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label htmlFor="collect-notes" className={styles.fieldLabel}>
                Payment Notes (Optional)
              </label>
              <input
                id="collect-notes"
                type="text"
                maxLength={400}
                className={styles.fieldInput}
                placeholder="Optional notes"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
              />
            </div>
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
