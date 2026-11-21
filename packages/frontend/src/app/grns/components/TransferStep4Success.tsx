'use client';

import React, { useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { Button, PRINT_MESSAGES } from '@/components/ui';
import { printHtmlDocument } from '@/lib/print-document';
import { formatTransferStockSummary, resolveTransferDocumentUrl } from './transferStep4Success.helper';
import styles from './TransferStep4Success.module.css';

export interface TransferStep4SuccessProps {
  facilityId: string;
  grn: Grn;
  movement: InternalMovementRecord;
  onDone: () => void;
}

export function TransferStep4Success({
  facilityId,
  grn,
  movement,
  onDone,
}: TransferStep4SuccessProps) {
  const [printing, setPrinting] = useState(false);
  const invoiceNumber = movement.transferInvoiceNumber;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printHtmlDocument({
        url: resolveTransferDocumentUrl(facilityId, movement.id),
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
        failureMessage: PRINT_MESSAGES.grnFailed,
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className={styles.successNotice}>
      <div className={styles.successTitle}>
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>Ownership Transfer Completed Successfully (యజమాన్య బదిలీ పూర్తయింది)</span>
      </div>

      {invoiceNumber && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Transfer Receipt / Invoice #:</span>
          <strong className={styles.detailValue} style={{ color: 'var(--color-primary-text)' }}>
            #{invoiceNumber}
          </strong>
        </div>
      )}

      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>GRN / Lot Number:</span>
        <span className={styles.detailValue}>{grn.grnNumber}</span>
      </div>

      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Transferred Stock:</span>
        <span className={styles.detailValue}>
          {formatTransferStockSummary(movement.totalBagsMoved, movement.resultingBagType, grn.bagType)}
        </span>
      </div>

      {movement.toCustomerName && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>New Owner (Buyer / Transferee):</span>
          <span className={styles.detailValue}>{movement.toCustomerName}</span>
        </div>
      )}

      {movement.transferFeeCharged != null && movement.transferFeeCharged > 0 && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Transfer Service Fee:</span>
          <span className={styles.detailValue}>
            ₹{movement.transferFeeCharged.toFixed(2)}
            {movement.feePayer ? ` (${movement.feePayer})` : ''}
          </span>
        </div>
      )}

      <div className={styles.actions}>
        <Button
          id="print-transfer-receipt-btn"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          isLoading={printing}
          disabled={printing}
        >
          <Printer size={14} style={{ marginRight: 'var(--space-1)' }} aria-hidden="true" />
          Print Transfer Receipt
        </Button>
        <Button
          id="finish-transfer-btn"
          variant="primary"
          size="sm"
          onClick={onDone}
        >
          Done / Close
        </Button>
      </div>
    </div>
  );
}
