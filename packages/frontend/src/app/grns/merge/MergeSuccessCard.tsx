'use client';

import React from 'react';
import { CheckCircle, Printer } from 'lucide-react';
import type { Grn, InternalMovementRecord, RentPayment } from '@cold-storage/contracts';
import { Button, PRINT_MESSAGES } from '@/components/ui';
import { printHtmlDocument } from '@/lib/print-document';
import styles from './page.module.css';

interface MergeSuccessCardProps {
  mergedTarget: Grn;
  mergedMovement: InternalMovementRecord | null;
  mergedPayment: RentPayment | null;
  facilityId: string;
  onViewInward: () => void;
  onReset: () => void;
}

export function MergeSuccessCard({
  mergedTarget,
  mergedMovement,
  mergedPayment,
  facilityId,
  onViewInward,
  onReset,
}: MergeSuccessCardProps) {
  return (
    <div className={styles.successCard}>
      <div className={styles.successHeader}>
        <CheckCircle size={20} aria-hidden="true" />
        <span>GRN Merge Successfully Executed!</span>
      </div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        Source batches have been consolidated into surviving GRN <strong>{mergedTarget.grnNumber}</strong>.
      </p>
      <div className={styles.successDetails}>
        {mergedMovement?.mergeInvoiceNumber && (
          <div>
            <span>Service Receipt / Invoice #: </span>
            <strong style={{ color: 'var(--color-primary)' }}>#{mergedMovement.mergeInvoiceNumber}</strong>
          </div>
        )}
        {mergedPayment?.receiptNumber && (
          <div>
            <span>Cash Memo (Hamali Charges): </span>
            <strong style={{ color: '#166534' }}>
              #{mergedPayment.receiptNumber} (₹{mergedPayment.amountPaid.toFixed(2)})
            </strong>
          </div>
        )}
        <div><span>Customer: </span><strong>{mergedTarget.customerName}</strong></div>
        <div><span>Commodity: </span><strong>{mergedTarget.commodityName} (Chamber {mergedTarget.chamber})</strong></div>
        <div><span>Consolidated Remaining Bags: </span><strong>{mergedTarget.closingBags ?? mergedTarget.bags} Bags</strong></div>
        <div><span>Resulting Bag Type: </span><strong>{mergedTarget.bagType}</strong></div>
        <div><span>Updated Rent Obligation: </span><strong>₹{(mergedTarget.rentAmount ?? 0).toLocaleString('en-IN')}</strong></div>
      </div>
      <div className={styles.successActions}>
        <Button variant="primary" onClick={onViewInward}>View Surviving GRN in Inward</Button>
        {mergedMovement?.id && facilityId && (
          <Button
            variant="secondary"
            leftIcon={<Printer size={14} aria-hidden="true" />}
            onClick={() => printHtmlDocument({
              url: `/api/facilities/${encodeURIComponent(facilityId)}/documents/merge-shifting-invoice/${encodeURIComponent(mergedMovement.id)}`,
              popupBlockedMessage: PRINT_MESSAGES.popupBlocked, failureMessage: PRINT_MESSAGES.grnFailed,
            })}
          >
            Print Merge Invoice
          </Button>
        )}
        {mergedPayment?.receiptNumber && facilityId && (
          <Button
            variant="secondary"
            leftIcon={<Printer size={14} aria-hidden="true" />}
            onClick={() => printHtmlDocument({
              url: `/api/facilities/${encodeURIComponent(facilityId)}/rent/receipts/${encodeURIComponent(mergedPayment.receiptNumber)}/print`,
              popupBlockedMessage: PRINT_MESSAGES.popupBlocked, failureMessage: PRINT_MESSAGES.grnFailed,
            })}
          >
            Print Hamali Cash Memo
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>Perform Another Merge</Button>
      </div>
    </div>
  );
}
