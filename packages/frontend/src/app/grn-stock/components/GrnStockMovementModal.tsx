'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import type { Grn, GrnMovementHistory } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useSettings } from '@/context/SettingsContext';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import { printHtmlString } from '@/lib/print-document';
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
      subtitle={`${selectedGrn.customerName} · ${selectedGrn.commodityName} · ${selectedGrn.chamber}`}
      size={history ? 'lg' : 'md'}
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
            {/* Header */}
            <div className={styles.movementHeader}>
              <div className={styles.movementHeaderLeft}>
                <span className={styles.movementCustomer}>{history.customerName}</span>
                <span className={styles.movementCommodity}>{history.commodityName}</span>
              </div>
              <div className={styles.movementHeaderRight}>
                <span className={styles.movementMeta}>Chamber: <strong>{history.chamber}</strong></span>
                <span className={styles.movementMeta}>Inward: <strong>{inwardDate}</strong></span>
              </div>
            </div>

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
                      <th scope="col">GP No.</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Small</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Big</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Total</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.entries.map((entry, idx) => {
                      const isInward = entry.type === 'INWARD';
                      const isReversal = entry.type === 'DELIVERY_REVERSAL';

                      const rowClass = isInward
                        ? styles.rowInward
                        : isReversal
                          ? styles.rowReversal
                          : styles.rowOutward;

                      const formattedDate = new Date(entry.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      });

                      const typeLabel = isInward
                        ? 'INWARD'
                        : isReversal
                          ? 'REVERSAL'
                          : entry.type === 'FINAL_OUTWARD'
                            ? 'OUTWARD'
                            : 'OUTWARD';

                      const totalBags = isInward
                        ? entry.closingBags
                        : isReversal
                          ? (entry.receivedBags ?? 0)
                          : entry.deliveredBags;

                      const smallDisplay = entry.smallBags != null ? entry.smallBags.toLocaleString('en-IN') : '—';
                      const bigDisplay = entry.bigBags != null ? entry.bigBags.toLocaleString('en-IN') : '—';

                      return (
                        <tr key={`${entry.grnId}-${entry.type}-${idx}`} className={rowClass}>
                          <td>{formattedDate}</td>
                          <td>
                            <span className={`${styles.typeTag} ${isInward ? styles.typeInward : isReversal ? styles.typeReversal : styles.typeOutward}`}>
                              {typeLabel}
                            </span>
                          </td>
                          <td>{entry.gpNumber || (entry.challanNumber ? entry.challanNumber : '—')}</td>
                          <td className={styles.numCell}>{smallDisplay}</td>
                          <td className={styles.numCell}>{bigDisplay}</td>
                          <td className={`${styles.numCell} ${isInward ? styles.receivedNum : ''}`}>
                            {totalBags.toLocaleString('en-IN')}
                          </td>
                          <td className={`${styles.numCell} ${styles.closingNum}`}>
                            {entry.closingBags.toLocaleString('en-IN')}
                            {entry.closingBags === 0 && <span className={styles.closedTag}>CLOSED</span>}
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
