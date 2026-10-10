'use client';

import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { seasonYearForInwardDate, type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, FeedbackStates, Modal, StatCard, StatGrid } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { PRINT_MESSAGES } from '@/components/ui/stateCopy';
import { printHtmlDocument } from '@/lib/print-document';
import {
  formatRemainingDue,
  formatRentStructure,
} from '../hooks/rentDisplay.helper';
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

  const originSeason = seasonYearForInwardDate(new Date(account.inwardDate));

  function periodLabel(ext: RentExtension): string {
    if (ext.period === 'SEASON') return `Season ${ext.seasonYear} renewal`;
    return `${ext.period === 'JANUARY' ? 'January' : 'February'} ${ext.seasonYear + 1}`;
  }

  const handlePrintReceipt = async (receiptNumber: string) => {
    if (!selectedFacilityId) return;
    setPrintingReceiptNum(receiptNumber);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/receipts/${encodeURIComponent(receiptNumber)}/print`,
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
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
      subtitle={`${account.customerName} · Inward: ${account.totalBags.toLocaleString('en-IN')} bags · Delivered: ${(account.deliveredBags ?? 0).toLocaleString('en-IN')} bags · Balance: ${(account.remainingBags ?? Math.max(0, account.totalBags - (account.deliveredBags ?? 0))).toLocaleString('en-IN')} bags`}
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
              label={account.rentType === 'Monthly' && account.rentAmount === 0 ? 'Rent Status' : 'Total Billed'}
              value={formatRentStructure(account)}
            />
            <StatCard
              label="Total Paid"
              value={`₹${account.totalPaid.toLocaleString('en-IN')}`}
              accent="success"
            />
            <StatCard
              label="Remaining Due"
              value={formatRemainingDue(account)}
              accent="warning"
            />
          </StatGrid>

          <h4 className={styles.sectionLabel}>
            Billing Periods ({account.extensions.length + 1})
          </h4>
          <div className={styles.paymentsList}>
            <div className={styles.paymentItem}>
              <div>
                <div className={styles.paymentHead}>
                  <strong className={styles.receiptNumber}>Season {originSeason} — Original</strong>
                  <Badge variant="primary">{account.rentType}</Badge>
                </div>
                <span className={styles.paymentMeta}>
                  {account.totalBags.toLocaleString('en-IN')} bags · agreed rate on record
                </span>
              </div>
              <strong className={styles.paymentAmount}>
                ₹{account.rentAmount.toLocaleString('en-IN')}
              </strong>
            </div>
            {account.extensions.map((ext) => (
              <div key={ext.id} className={styles.paymentItem}>
                <div>
                  <div className={styles.paymentHead}>
                    <strong className={styles.receiptNumber}>{periodLabel(ext)}</strong>
                    <Badge variant={ext.manualAmount != null ? 'warning' : 'neutral'}>
                      {ext.manualAmount != null ? 'Overridden' : 'Finalized'}
                    </Badge>
                  </div>
                  <span className={styles.paymentMeta}>
                    Snapshot {ext.snapshotBags.toLocaleString('en-IN')} bags · ₹{ext.bagRate.toFixed(2)}/bag ·{' '}
                    {new Date(ext.finalizedAt).toLocaleDateString('en-IN')} · by {ext.finalizedBy}
                  </span>
                  {ext.manualAmount != null && (
                    <span className={styles.paymentNotes}>
                      Calculated ₹{ext.calculatedAmount.toLocaleString('en-IN')}
                      {ext.overrideReason ? ` · ${ext.overrideReason}` : ''}
                    </span>
                  )}
                </div>
                <strong className={styles.paymentAmount}>
                  ₹{ext.finalAmount.toLocaleString('en-IN')}
                </strong>
              </div>
            ))}
            <div className={styles.paymentItem}>
              <div>
                <div className={styles.paymentHead}>
                  <strong className={styles.receiptNumber}>Total Due</strong>
                </div>
              </div>
              <strong className={styles.paymentAmount}>
                ₹{account.totalDue.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          <h4 className={styles.sectionLabel}>
            Issued Official Cash Memos ({account.payments.length})
          </h4>

          {error && <Banner message={error} id="rent-history-error" />}

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
