'use client';

import React from 'react';
import { CreditCard, Wallet } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
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
  canPrint: _canPrint,
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
    collectSubmitting,
    handleSubmit,
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
            {collectError && <Banner message={collectError} id="collect-error" />}

            <RentSummaryOverview account={account} />

            {account.rentType === 'Monthly' && account.rentAmount === 0 && (
              <div style={{ padding: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                No fixed upfront contract rent configured for this Monthly GRN. Billing accrues dynamically per cycle.
              </div>
            )}

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
              <input
                id="collect-amount"
                type="number"
                min={1}
                max={account.remainingBalance > 0 ? account.remainingBalance : undefined}
                step="0.01"
                required
                disabled={account.remainingBalance === 0}
                className={styles.fieldInput}
                placeholder={account.remainingBalance === 0 ? 'No outstanding dues' : 'Enter amount'}
                value={collectAmount}
                aria-invalid={Boolean(collectError)}
                aria-describedby={collectError ? 'collect-error' : undefined}
                onChange={(e) =>
                  setCollectAmount(e.target.value ? parseFloat(e.target.value) : '')
                }
              />
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel} id="payment-mode-label">Payment Mode *</span>
              <div className={styles.modeToggleGroup} role="radiogroup" aria-labelledby="payment-mode-label">
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
                {collectMode === 'UPI' ? 'Additional Notes (Optional)' : 'Payment Notes (Optional)'}
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
