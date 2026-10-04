'use client';

import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, FeedbackStates, Modal, StatCard, StatGrid } from '@/components/ui';
import { printHtmlDocument } from '@/lib/print-document';
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
  const [error, setError] = useState<string | null>(null);

  const handlePrintReceipt = async (receiptNumber: string) => {
    if (!selectedFacilityId) return;
    setPrintingReceiptNum(receiptNumber);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/receipts/${encodeURIComponent(receiptNumber)}/print`,
        popupBlockedMessage:
          'Pop-up window was blocked. Please allow pop-ups for this site to print rent receipts.',
        failureMessage: 'Failed to generate rent receipt',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate rent receipt');
    } finally {
      setPrintingReceiptNum(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cash Memos: ${account.grnNumber}`}
      subtitle={`Customer: ${account.customerName}`}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className={styles.modalBody}>
          <StatGrid label={`Rent summary for ${account.grnNumber}`}>
            <StatCard
              label="Total Billed"
              value={`₹${account.rentAmount.toLocaleString('en-IN')}`}
            />
            <StatCard
              label="Total Paid"
              value={`₹${account.totalPaid.toLocaleString('en-IN')}`}
              accent="success"
            />
            <StatCard
              label="Remaining Due"
              value={`₹${account.remainingBalance.toLocaleString('en-IN')}`}
              accent="warning"
            />
          </StatGrid>

          <h4 className={styles.sectionLabel}>
            Issued Official Cash Memos ({account.payments.length})
          </h4>

          {error && (
            <div className={styles.modalError} role="alert">
              {error}
            </div>
          )}

          {account.payments.length === 0 ? (
            <FeedbackStates.Empty message="No cash memos issued yet for this account." />
          ) : (
            <div className={styles.paymentsList}>
              {account.payments.map((p) => (
                <div key={p.id} className={styles.paymentItem}>
                  <div>
                    <div className={styles.paymentHead}>
                      <strong className={styles.receiptNumber}>{p.receiptNumber}</strong>
                      <Badge variant={p.paymentMode === 'Cash' ? 'primary' : 'success'}>
                        {p.paymentMode}
                      </Badge>
                    </div>
                    <span className={styles.paymentMeta}>
                      {new Date(p.paymentDate).toLocaleDateString('en-IN')} • Received by{' '}
                      {p.createdBy}
                    </span>
                    {p.notes && <span className={styles.paymentNotes}>Notes: {p.notes}</span>}
                  </div>

                  <div className={styles.paymentActions}>
                    <strong className={styles.paymentAmount}>
                      ₹{p.amountPaid.toLocaleString('en-IN')}
                    </strong>

                    {canPrint && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handlePrintReceipt(p.receiptNumber)}
                        disabled={printingReceiptNum === p.receiptNumber}
                        isLoading={printingReceiptNum === p.receiptNumber}
                        title="Print Official Cash Memo"
                        leftIcon={<Printer size={13} aria-hidden="true" />}
                      >
                        Print
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}
