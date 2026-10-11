'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import type { Grn, GrnMovementHistory } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useSettings } from '@/context/SettingsContext';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import { printHtmlString } from '@/lib/print-document';
import { parseMovementRow } from '../utils/grnMovementView.helper';
import { renderGrnStockHtml } from '../utils/renderGrnStockHtml';
import styles from '../page.module.css';

interface GrnStockMovementModalProps {
  selectedGrn: Grn;
  history: GrnMovementHistory | null;
  loadingLedger: boolean;
  ledgerError: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export function GrnStockMovementModal({
  selectedGrn,
  history,
  loadingLedger,
  ledgerError,
  onClose,
  onRetry,
}: GrnStockMovementModalProps) {
  const { settings } = useSettings();
  const orgName = settings?.orgName || ORG_NAME_FALLBACK;

  const handlePrint = () => {
    if (!history) return;
    const html = renderGrnStockHtml(history, orgName);
    printHtmlString(html);
  };

  const inwardDate = history
    ? new Date(history.inwardDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`GRN Stock Movement — ${selectedGrn.grnNumber}`}
      subtitle={`${selectedGrn.customerName} · ${selectedGrn.commodityName} · ${selectedGrn.chamber} · Inward: ${inwardDate}`}
      size={history ? 'xl' : 'md'}
      className={styles.ledgerModal}
      footer={
        <>
          {history && (
            <Button variant="primary" onClick={handlePrint} leftIcon={<Printer size={15} aria-hidden="true" />}>
              Print
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        {loadingLedger ? (
          <FeedbackStates.Loading label="Loading GRN stock movement..." />
        ) : ledgerError ? (
          <FeedbackStates.Error title="Error loading movement" message={ledgerError} onRetry={onRetry} />
        ) : !history ? (
          <FeedbackStates.Empty message="No movement history available for this GRN." />
        ) : (
          <div className={styles.movementView}>
            {/* Summary Cards */}
            <div className={styles.summaryRow}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Opening Stock</span>
                <span className={styles.summaryValue}>
                  {history.totalInwardBags.toLocaleString('en-IN')}
                  <span className={styles.summaryUnit}> Bags</span>
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total Outward</span>
                <span className={`${styles.summaryValue} ${styles.summaryOutward}`}>
                  {history.netDeliveredBags.toLocaleString('en-IN')}
                  <span className={styles.summaryUnit}> Bags</span>
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Current Stock</span>
                <span className={`${styles.summaryValue} ${styles.summaryBalance}`}>
                  {history.currentClosingBags.toLocaleString('en-IN')}
                  <span className={styles.summaryUnit}> Bags</span>
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Status</span>
                <Badge variant={history.status === 'CLOSED' ? 'neutral' : 'warning'} style={{ marginTop: 'var(--space-1)' }}>
                  {history.status}
                </Badge>
              </div>
            </div>

            {/* Movement Table */}
            <div className={styles.movementTableSection}>
              <span className={styles.movementTableHeading}>Customer Bag Movement</span>
              <div className={styles.tableWrapper}>
                <table className={styles.ledgerTable} aria-label="GRN Stock Movement">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">GP / Ref #</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Small</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Big</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Total</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Balance</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.entries.map((entry, idx) => {
                      const p = parseMovementRow(entry);
                      const formattedDate = new Date(entry.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      });

                      const rowClass = {
                        inward: styles.rowInward,
                        mergeIn: styles.rowMergeIn,
                        mergeOut: styles.rowOutward,
                        transfer: styles.rowTransfer,
                        outward: styles.rowOutward,
                        reversal: styles.rowReversal,
                      }[p.badgeType];

                      const badgeClass = {
                        inward: styles.typeInward,
                        mergeIn: styles.typeMergeIn,
                        mergeOut: styles.typeOutward,
                        transfer: styles.typeTransfer,
                        outward: styles.typeOutward,
                        reversal: styles.typeReversal,
                      }[p.badgeType];

                      return (
                        <tr key={`${entry.grnId}-${entry.type}-${idx}`} className={rowClass}>
                          <td>{formattedDate}</td>
                          <td>
                            <span className={`${styles.typeTag} ${badgeClass}`}>
                              {p.typeLabel}
                            </span>
                          </td>
                          <td className={styles.refCell}>{p.refNumber}</td>
                          <td className={styles.numCell}>{p.smallDisplay}</td>
                          <td className={styles.numCell}>{p.bigDisplay}</td>
                          <td className={`${styles.numCell} ${p.isReceived ? styles.receivedNum : ''}`}>
                            {p.totalDisplay}
                          </td>
                          <td className={`${styles.numCell} ${styles.closingNum}`}>
                            {entry.closingBags.toLocaleString('en-IN')}
                            {entry.closingBags === 0 && <span className={styles.closedTag}>CLOSED</span>}
                          </td>
                          <td className={styles.notesCell} title={p.notes !== '—' ? p.notes : undefined}>
                            {p.notes}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
