'use client';

import React from 'react';
import { CreditCard, Eye, Wallet } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { RentSummaryOverview } from './RentSummaryOverview';
import { useCollectPaymentForm } from '../hooks/useCollectPaymentForm';
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
  canPrint,
  onClose,
  onPaymentSuccess,
}: CollectPaymentModalProps) {
  const {
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
    previewError,
    collectSubmitting,
    handleSubmit,
    handlePreviewReceipt,
  } = useCollectPaymentForm({
    account,
    selectedFacilityId,
    onPaymentSuccess,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Collect Rent & Issue Cash Memo"
      subtitle={`${account.customerName} · ${account.grnNumber}`}
      size="md"
    >
      <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {collectError && (
              <div className={styles.modalError} role="alert">
                {collectError}
              </div>
            )}

            {previewError && (
              <div className={styles.modalError} role="alert">
                {previewError}
              </div>
            )}

            <RentSummaryOverview account={account} />

            <div className={styles.fieldGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="collect-amount" className={styles.fieldLabel}>
                  Amount to Collect (₹) *
                </label>
                {account.remainingBalance > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.quickFillBtn}
                    onClick={() => setCollectAmount(account.remainingBalance)}
                  >
                    Pay Full Balance (₹{account.remainingBalance})
                  </Button>
                )}
              </div>
              <input aria-label="Enter amount"
                id="collect-amount"
                type="number"
                min={1}
                max={account.remainingBalance}
                step="0.01"
                required
                className={styles.fieldInput}
                placeholder="Enter amount"
                value={collectAmount}
                onChange={(e) =>
                  setCollectAmount(e.target.value ? parseFloat(e.target.value) : '')
                }
              />
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Payment Mode *</span>
              <div className={styles.modeToggleGroup}>
                <Button
                  type="button"
                  variant={collectMode === 'Cash' ? 'primary' : 'outline'}
                  className={`${styles.modeOption} ${collectMode === 'Cash' ? styles.modeOptionActive : ''}`}
                  onClick={() => setCollectMode('Cash')}
                  leftIcon={<Wallet size={16} aria-hidden="true" />}
                >
                  Cash
                </Button>
                <Button
                  type="button"
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
                {collectMode === 'UPI' ? 'Additional Notes (Optional)' : 'Payment Notes (Optional)'}
              </label>
              <input
                aria-label="Optional payment notes"
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
            {canPrint && typeof collectAmount === 'number' && collectAmount > 0 && (
              <Button
                variant="outline"
                onClick={() => void handlePreviewReceipt()}
                leftIcon={<Eye size={14} aria-hidden="true" />}
              >
                Preview Cash Memo
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onClose}
              disabled={collectSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="confirm-collect-payment-btn"
              type="submit"
              variant="primary"
              disabled={collectSubmitting || typeof collectAmount !== 'number' || collectAmount <= 0}
              isLoading={collectSubmitting}
            >
              Collect & Issue Cash Memo
            </Button>
          </div>
        </form>
    </Modal>
  );
}
