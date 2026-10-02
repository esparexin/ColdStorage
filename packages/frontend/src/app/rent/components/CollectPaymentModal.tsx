'use client';

import React from 'react';
import { CreditCard, Eye, Wallet, X } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
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
    collectError,
    collectSubmitting,
    handleSubmit,
    handlePreviewReceipt,
  } = useCollectPaymentForm({
    account,
    selectedFacilityId,
    onPaymentSuccess,
  });

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="collect-payment-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="collect-payment-title" className={styles.modalTitle}>
            Collect Rent Payment
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

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {collectError && <div className={styles.modalError}>{collectError}</div>}

            <div className={styles.infoCard}>
              <div className={styles.infoRow}>
                <span style={{ color: 'var(--color-text-muted)' }}>Customer</span>
                <strong>{account.customerName}</strong>
              </div>
              <div className={styles.infoRow}>
                <span style={{ color: 'var(--color-text-muted)' }}>GRN Reference</span>
                <span>{account.grnNumber}</span>
              </div>
              <div className={styles.infoRow}>
                <span style={{ color: 'var(--color-text-muted)' }}>Total Contract Rent</span>
                <span>₹{account.rentAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className={styles.infoRow}>
                <span style={{ color: 'var(--color-text-muted)' }}>Total Already Paid</span>
                <span style={{ color: 'var(--color-success)' }}>
                  ₹{account.totalPaid.toLocaleString('en-IN')}
                </span>
              </div>
              <div className={styles.infoRow} style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                <span style={{ fontWeight: 600 }}>Remaining Due</span>
                <strong style={{ color: 'var(--color-warning)', fontSize: 'var(--text-base)' }}>
                  ₹{account.remainingBalance.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="collect-amount" className={styles.fieldLabel}>
                  Amount to Collect (₹) *
                </label>
                {account.remainingBalance > 0 && (
                  <button
                    type="button"
                    className={styles.quickFillBtn}
                    onClick={() => setCollectAmount(account.remainingBalance)}
                  >
                    Pay Full Balance (₹{account.remainingBalance})
                  </button>
                )}
              </div>
              <input
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
                <button
                  type="button"
                  className={`${styles.modeOption} ${collectMode === 'Cash' ? styles.modeOptionActive : ''}`}
                  onClick={() => setCollectMode('Cash')}
                >
                  <Wallet size={16} aria-hidden="true" />
                  Cash
                </button>
                <button
                  type="button"
                  className={`${styles.modeOption} ${collectMode === 'UPI' ? styles.modeOptionActive : ''}`}
                  onClick={() => setCollectMode('UPI')}
                >
                  <CreditCard size={16} aria-hidden="true" />
                  UPI
                </button>
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

            <div className={styles.fieldGroup}>
              <label htmlFor="collect-notes" className={styles.fieldLabel}>
                Receipt Notes / UPI Reference ID
              </label>
              <input
                id="collect-notes"
                type="text"
                maxLength={500}
                className={styles.fieldInput}
                placeholder="Optional notes or bank transaction reference"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            {canPrint && typeof collectAmount === 'number' && collectAmount > 0 && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => void handlePreviewReceipt()}
              >
                <Eye size={14} aria-hidden="true" />
                Preview Receipt
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={collectSubmitting}
            >
              Cancel
            </button>
            <button
              id="confirm-collect-payment-btn"
              type="submit"
              className={styles.primaryBtn}
              disabled={collectSubmitting || typeof collectAmount !== 'number' || collectAmount <= 0}
            >
              {collectSubmitting ? 'Recording...' : 'Collect & Issue Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
