'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import type { Grn, GrnMovementHistory } from '@cold-storage/contracts';
import { Badge, Button, DataTable, type DataTableColumn, Modal } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useSettings } from '@/context/SettingsContext';
import { ORG_NAME_FALLBACK } from '@/lib/branding';
import { printHtmlString } from '@/lib/print-document';
import { parseMovementRow } from '../utils/grnMovementView.helper';
import { renderGrnStockHtml } from '../utils/renderGrnStockHtml';
import styles from '../page.module.css';

type MovementEntry = GrnMovementHistory['entries'][number];

interface GrnStockMovementModalProps {
  selectedGrn: Grn;
  history: GrnMovementHistory | null;
  loadingLedger: boolean;
  ledgerError: string | null;
  onClose: () => void;
  onRetry: () => void;
}

const movementColumns: DataTableColumn<MovementEntry>[] = [
  {
    key: 'date',
    header: 'Date',
    render: (entry) =>
      new Date(entry.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      }),
  },
  {
    key: 'type',
    header: 'Type',
    render: (entry) => {
      const p = parseMovementRow(entry);
      const badgeClass = {
        inward: styles.typeInward,
        mergeIn: styles.typeMergeIn,
        mergeOut: styles.typeOutward,
        transfer: styles.typeTransfer,
        outward: styles.typeOutward,
        reversal: styles.typeReversal,
      }[p.badgeType];
      return <span className={`${styles.typeTag} ${badgeClass}`}>{p.typeLabel}</span>;
    },
  },
  {
    key: 'refNumber',
    header: 'GP / Ref #',
    render: (entry) => {
      const p = parseMovementRow(entry);
      return <span className={styles.refCell}>{p.refNumber}</span>;
    },
  },
  {
    key: 'small',
    header: 'Small',
    align: 'right',
    render: (entry) => {
      const p = parseMovementRow(entry);
      return <span className={styles.numCell}>{p.smallDisplay}</span>;
    },
  },
  {
    key: 'big',
    header: 'Big',
    align: 'right',
    render: (entry) => {
      const p = parseMovementRow(entry);
      return <span className={styles.numCell}>{p.bigDisplay}</span>;
    },
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (entry) => {
      const p = parseMovementRow(entry);
      return (
        <span className={`${styles.numCell} ${p.isReceived ? styles.receivedNum : ''}`}>
          {p.totalDisplay}
        </span>
      );
    },
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    render: (entry) => (
      <span className={`${styles.numCell} ${styles.closingNum}`}>
        {entry.closingBags.toLocaleString('en-IN')}
        {entry.closingBags === 0 && <span className={styles.closedTag}>CLOSED</span>}
      </span>
    ),
  },
  {
    key: 'notes',
    header: 'Notes',
    render: (entry) => {
      const p = parseMovementRow(entry);
      return (
        <span className={styles.notesCell} title={p.notes !== '—' ? p.notes : undefined}>
          {p.notes}
        </span>
      );
    },
  },
];

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
              <DataTable
                columns={movementColumns}
                rows={history.entries}
                rowKey={(entry, idx) => `${entry.grnId}-${entry.type}-${idx}`}
                caption="Customer Bag Movement"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
