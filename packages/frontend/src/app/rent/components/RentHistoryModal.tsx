'use client';

import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface RentHistoryModalProps {
  account: RentSummaryDto;
  selectedFacilityId: string;
  canPrint: boolean;
  onClose: () => void;
}

export function RentHistoryModal({
  account,
  selectedFacilityId,
  canPrint,
  onClose,
}: RentHistoryModalProps) {
  const [printingReceiptNum, setPrintingReceiptNum] = useState<string | null>(null);

  const handlePrintReceipt = async (receiptNumber: string) => {
    if (!selectedFacilityId) return;
    setPrintingReceiptNum(receiptNumber);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/receipts/${encodeURIComponent(receiptNumber)}/print`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print rent receipts.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate rent receipt');
    } finally {
      setPrintingReceiptNum(null);
    }
  };

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <h2 id="history-title" className={styles.modalTitle}>
              Rent Receipts: {account.grnNumber}
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Customer: {account.customerName} ({account.customerMobile})
            </span>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Total Billed
              </span>
              <div style={{ fontWeight: 700 }}>
                ₹{account.rentAmount.toLocaleString('en-IN')}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Total Paid
              </span>
              <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                ₹{account.totalPaid.toLocaleString('en-IN')}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Remaining Due
              </span>
              <div style={{ fontWeight: 700, color: 'var(--color-warning)' }}>
                ₹{account.remainingBalance.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase' }}>
            Issued Official Receipts ({account.payments.length})
          </h4>

          {account.payments.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              No payment receipts issued yet for this account.
            </p>
          ) : (
            <div className={styles.paymentsList}>
              {account.payments.map((p) => (
                <div key={p.id} className={styles.paymentItem}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: 'var(--text-sm)' }}>
                        {p.receiptNumber}
                      </strong>
                      <span
                        className={p.paymentMode === 'Cash' ? styles.badgeCash : styles.badgeUpi}
                      >
                        {p.paymentMode}
                      </span>
                    </div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                      {new Date(p.paymentDate).toLocaleDateString('en-IN')} • Received by{' '}
                      {p.createdBy}
                    </span>
                    {p.notes && (
                      <span style={{ display: 'block', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        Notes: {p.notes}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-success)' }}>
                      ₹{p.amountPaid.toLocaleString('en-IN')}
                    </strong>

                    {canPrint && (
                      <button
                        type="button"
                        className={styles.actionBtnSuccess}
                        onClick={() => void handlePrintReceipt(p.receiptNumber)}
                        disabled={printingReceiptNum === p.receiptNumber}
                        title="Print Official Rent Receipt"
                      >
                        <Printer size={13} aria-hidden="true" />
                        Print
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
