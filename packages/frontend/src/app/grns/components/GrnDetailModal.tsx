'use client';

import React from 'react';
import { FileText, Printer } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  onClose: () => void;
  canPrint: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnDetailModal({
  grn,
  onClose,
  canPrint,
  printingId,
  onPrint,
}: GrnDetailModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Acknowledgement Details: ${grn.grnNumber}`}
      subtitle={`Inward Receipt #${grn.inwardReceiptNumber}`}
      size="lg"
      footer={
        <>
          {canPrint && (
            <>
              <Button
                variant="primary"
                onClick={() => onPrint('grn', grn.id)}
                disabled={printingId === `grn-${grn.id}`}
                isLoading={printingId === `grn-${grn.id}`}
                leftIcon={<Printer size={15} aria-hidden="true" />}
              >
                Print Official GRN
              </Button>
              <Button
                variant="secondary"
                onClick={() => onPrint('receipt', grn.id)}
                disabled={printingId === `receipt-${grn.id}`}
                isLoading={printingId === `receipt-${grn.id}`}
                leftIcon={<FileText size={15} aria-hidden="true" />}
              >
                Print Inward Receipt
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Inward Date</span>
              <span className={styles.detailValue}>
                {new Date(grn.date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.detailValue}>
                <Badge variant={grn.status === 'OPEN' ? 'warning' : 'neutral'}>
                  {grn.status}
                </Badge>
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Customer</span>
              <span className={styles.detailValue}>{grn.customerName}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Commodity</span>
              <span className={styles.detailValue}>{grn.commodityName}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Chamber</span>
              <span className={styles.detailValue}>Chamber {grn.chamber}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Bags Accounting</span>
              <span className={styles.detailValue}>
                {grn.bags.toLocaleString('en-IN')} Bags (Type: {grn.bagType})
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Small Bag Weight</span>
              <span className={styles.detailValue}>
                {grn.smallBagWeight ? `${grn.smallBagWeight} kg per bag` : '—'}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Big Bag Weight</span>
              <span className={styles.detailValue}>
                {grn.bigBagWeight ? `${grn.bigBagWeight} kg per bag` : '—'}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Rent Structure</span>
              <span className={styles.detailValue}>
                {grn.rentType}
                {grn.rentType === 'Monthly' && grn.rentMonths
                  ? ` (${grn.rentMonths} Months, info only)`
                  : ''}{' '}
                — ₹{grn.rentAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Gate Pass (GP) #</span>
              <span className={styles.detailValue}>{grn.gpNumber || 'None'}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Vehicle Registration</span>
              <span className={styles.detailValue}>
                {grn.vehicleNumber || 'None'}
              </span>
            </div>

            <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
              <span className={styles.detailLabel}>Remarks</span>
              <span className={styles.detailValue}>{grn.remarks || 'None'}</span>
            </div>
          </div>
        </div>
    </Modal>
  );
}
