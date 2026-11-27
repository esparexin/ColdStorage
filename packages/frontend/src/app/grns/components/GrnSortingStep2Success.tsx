'use client';

import React, { useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { RepackGrnResult } from '@cold-storage/contracts';
import { Button, PRINT_MESSAGES } from '@/components/ui';
import { printHtmlDocument } from '@/lib/print-document';
import styles from './GrnSortingModal.module.css';

interface GrnSortingStep2SuccessProps {
  facilityId: string;
  repackResult: RepackGrnResult;
  onDone: () => void;
}

export function GrnSortingStep2Success({
  facilityId,
  repackResult,
  onDone,
}: GrnSortingStep2SuccessProps) {
  const [printing, setPrinting] = useState(false);
  const invoiceNumber = repackResult.sortingInvoiceNumber;
  const serviceCharge = repackResult.totalServiceCharge ?? repackResult.hamaliCharge ?? 0;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(facilityId)}/documents/sorting-invoice/${encodeURIComponent(repackResult.movement.id)}`,
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
        failureMessage: PRINT_MESSAGES.grnFailed,
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className={styles.billSuccessNotice}>
      <div className={styles.billTitle}>
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>Repacking &amp; Rebagging Completed Successfully</span>
      </div>

      {invoiceNumber && (
        <div className={styles.billDetailRow}>
          <span>Service Invoice #:</span>
          <strong style={{ color: 'var(--color-primary-text)' }}>#{invoiceNumber}</strong>
        </div>
      )}

      <div className={styles.billDetailRow}>
        <span>Resulting Stock:</span>
        <strong>{repackResult.grn.bags} bags ({repackResult.grn.bagType})</strong>
      </div>

      <div className={styles.billDetailRow}>
        <span>Service &amp; Labor Charges:</span>
        <strong>₹{serviceCharge.toFixed(2)}</strong>
      </div>

      <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {invoiceNumber && (
          <Button
            id="print-sorting-invoice-btn"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            isLoading={printing}
            disabled={printing}
          >
            <Printer size={14} style={{ marginRight: 'var(--space-1)' }} aria-hidden="true" />
            Print Service Invoice
          </Button>
        )}
        <Button
          id="finish-repack-btn"
          variant="primary"
          size="sm"
          onClick={onDone}
        >
          Done / Complete
        </Button>
      </div>
    </div>
  );
}
