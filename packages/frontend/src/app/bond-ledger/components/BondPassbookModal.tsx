'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import type { Grn, GrnMovementHistory, RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { printHtmlString } from '@/lib/print-document';
import { renderPassbookHtml } from '../utils/renderPassbookHtml';
import styles from '../page.module.css';

interface BondPassbookModalProps {
  selectedGrn: Grn;
  history: GrnMovementHistory | null;
  rentSummary: RentSummaryDto | null;
  loadingLedger: boolean;
  ledgerError: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export function BondPassbookModal({
  selectedGrn,
  history,
  rentSummary,
  loadingLedger,
  ledgerError,
  onClose,
  onRetry,
}: BondPassbookModalProps) {
  const handlePrint = () => {
    if (!history) return;
    const html = renderPassbookHtml(history, rentSummary);
    printHtmlString(html);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={selectedGrn.bondNumber ? `Bond Movement Ledger: ${selectedGrn.bondNumber}` : `GRN Movement Ledger: ${selectedGrn.grnNumber}`}
      subtitle={`${selectedGrn.customerName} — ${selectedGrn.commodityName} (Chamber ${selectedGrn.chamber})`}
      size={history ? 'lg' : 'md'}
      className={styles.ledgerModal}
      footer={
        <>
          {history && (
            <Button variant="primary" onClick={handlePrint} leftIcon={<Printer size={15} aria-hidden="true" />}>
              Print Passbook
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        {loadingLedger ? (
          <FeedbackStates.Loading label="Loading outward movement ledger passbook..." />
        ) : ledgerError ? (
          <FeedbackStates.Error title="Error loading ledger" message={ledgerError} onRetry={onRetry} />
        ) : !history ? (
          <FeedbackStates.Empty message="No movement history available for this bond." />
        ) : (
          <div className={styles.passbookCard}>
            <div className={styles.passbookHeader}>
              <h2 className={styles.passbookHeading}>
                {history.customerName} — {history.bondNumber ? `Bond #${history.bondNumber} • ` : ''}GRN #{history.grnNumber} ({history.commodityName})
              </h2>

              <div className={styles.metaRow}>
                {history.bondNumber && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaLabel}>Bond #:</span>
                    <strong className={styles.metaValue} style={{ color: 'var(--color-primary)' }}>{history.bondNumber}</strong>
                  </span>
                )}
                <span className={styles.metaItem}><span className={styles.metaLabel}>GRN #:</span> <span className={styles.metaValue}>{history.grnNumber}</span></span>
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Inward Date:</span>
                  <span className={styles.metaValue}>
                    {new Date(history.inwardDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </span>
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Chamber:</span>
                  <span className={styles.metaValue}>Chamber {history.chamber}</span>
                </span>
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Initial Received:</span>
                  <span className={styles.metaValue}>
                    {history.totalInwardBags.toLocaleString('en-IN')} Bags
                    {history.originalSmallBags != null || history.originalBigBags != null ? ` (Small: ${history.originalSmallBags ?? 0}, Big: ${history.originalBigBags ?? 0})` : ''}
                  </span>
                </span>
                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Current Stored:</span>
                  <span className={styles.metaValue}>
                    {history.currentClosingBags.toLocaleString('en-IN')} Bags
                    {history.currentClosingSmallBags != null || history.currentClosingBigBags != null ? ` (Small: ${history.currentClosingSmallBags ?? 0}, Big: ${history.currentClosingBigBags ?? 0})` : ''}
                  </span>
                </span>

                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Physical Status:</span>
                  <Badge variant={history.status === 'CLOSED' ? 'neutral' : 'warning'}>
                    {history.status}
                  </Badge>
                </span>

                <span className={styles.metaItem}>
                  <span className={styles.metaLabel}>Bond Loan:</span>
                  <Badge
                    variant={
                      history.loanStatus === 'TAKEN'
                        ? 'danger'
                        : history.loanStatus === 'CLEARED'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {history.loanStatus === 'TAKEN'
                      ? 'Loan Active (Hold)'
                      : history.loanStatus === 'CLEARED'
                        ? 'Loan Cleared'
                        : history.loanStatus === 'NOT_TAKEN'
                          ? 'Loan Not Taken (Pledged)'
                          : 'Standard Storage'}
                  </Badge>
                </span>

                {history.loanBankName && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaLabel}>Lien Holder:</span>
                    <span className={styles.metaValue}>
                      {history.loanBankName}{history.loanReferenceNumber ? ` (Ref: ${history.loanReferenceNumber})` : ''}
                    </span>
                  </span>
                )}

                {rentSummary && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaLabel}>Rent:</span>
                    <Badge variant={rentSummary.paymentStatus === 'Settled' ? 'success' : 'warning'}>
                      {rentSummary.paymentStatus === 'Settled'
                        ? 'Settled'
                        : `Not Settled (₹${rentSummary.remainingBalance.toLocaleString('en-IN')} due)`}
                    </Badge>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.ledgerTable} aria-label="Bond Outward Movement Ledger">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Received</th>
                    <th scope="col">Delivery</th>
                    <th scope="col">Closing</th>
                    <th scope="col">G.P.No.</th>
                    <th scope="col">Mark</th>
                    <th scope="col">Small Bags</th>
                    <th scope="col">Big Bags</th>
                    <th scope="col">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry, idx) => {
                    const isEntryInward = entry.type === 'INWARD';
                    const isEntryReversal = entry.type === 'DELIVERY_REVERSAL';
                    const isFinalOutward = entry.type === 'FINAL_OUTWARD';

                    const rowClass = isEntryInward
                      ? styles.rowInward
                      : isFinalOutward
                        ? styles.rowFinal
                        : styles.rowOutward;

                    const formattedDate = new Date(entry.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });

                    const receivedDisplay = isEntryInward
                      ? (entry.receivedBags ?? entry.closingBags).toLocaleString('en-IN')
                      : isEntryReversal
                        ? `+${(entry.receivedBags ?? entry.deliveredBags).toLocaleString('en-IN')} (Reversed)`
                        : '—';

                    const deliveryDisplay = isEntryInward ? (
                      '—'
                    ) : isEntryReversal ? (
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        Reversal of {entry.challanNumber || 'Challan'}
                      </span>
                    ) : (
                      <span>
                        <span className={styles.deliveryNum}>
                          {entry.deliveredBags.toLocaleString('en-IN')}
                        </span>
                        {entry.challanNumber && (
                          <span className={styles.challanBadge}>({entry.challanNumber})</span>
                        )}
                      </span>
                    );

                    const smallBagsDisplay =
                      entry.smallBags != null ? entry.smallBags.toLocaleString('en-IN') : '—';
                    const bigBagsDisplay =
                      entry.bigBags != null ? entry.bigBags.toLocaleString('en-IN') : '—';

                    return (
                      <tr key={`${entry.grnId}-${entry.type}-${idx}`} className={rowClass}>
                        <td>{formattedDate}</td>
                        <td className={`${styles.numCell} ${isEntryInward ? styles.receivedNum : ''}`}>
                          {receivedDisplay}
                        </td>
                        <td className={styles.numCell}>{deliveryDisplay}</td>
                        <td className={`${styles.numCell} ${styles.closingNum}`}>
                          {entry.closingBags.toLocaleString('en-IN')}
                          {entry.closingBags === 0 && <span className={styles.closedTag}>CLOSED</span>}
                        </td>
                        <td>{entry.gpNumber || '—'}</td>
                        <td>{entry.marks || '—'}</td>
                        <td className={styles.numCell}>{smallBagsDisplay}</td>
                        <td className={styles.numCell}>{bigBagsDisplay}</td>
                        <td className={styles.remarksCell} title={entry.remarks || ''}>
                          {entry.remarks ||
                            (entry.vehicleNumber
                              ? `${entry.vehicleNumber}${entry.driverName ? ` (${entry.driverName})` : ''}`
                              : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
