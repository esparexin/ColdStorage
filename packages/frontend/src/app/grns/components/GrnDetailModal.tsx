'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Printer, X } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  onClose: () => void;
  canPrint: boolean;
  canAllocate: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnDetailModal({
  grn,
  onClose,
  canPrint,
  canAllocate,
  printingId,
  onPrint,
}: GrnDetailModalProps) {
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <h2 id="detail-modal-title" className={styles.modalTitle}>
              GRN Details: {grn.grnNumber}
            </h2>
            <span className={styles.receiptNumber}>
              Inward Receipt #{grn.inwardReceiptNumber}
            </span>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

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
                <span
                  className={
                    grn.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed
                  }
                >
                  {grn.status}
                </span>
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
              <span className={styles.detailValue}>Chamber {grn.chamberNumber}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Bags Accounting</span>
              <span className={styles.detailValue}>
                {grn.bags.toLocaleString('en-IN')} Bags (Type: {grn.bagType})
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Authoritative Weight</span>
              <span className={styles.detailValue}>
                {grn.authoritativeWeight
                  ? `${grn.authoritativeWeight} kg`
                  : 'Not recorded'}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Rent Structure</span>
              <span className={styles.detailValue}>
                {grn.rentType}
                {grn.rentType === 'Monthly' && grn.rentMonths
                  ? ` (${grn.rentMonths} Months)`
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

        <div className={styles.modalFooter}>
          {canPrint && (
            <>
              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() => onPrint('grn', grn.id)}
                disabled={printingId === `grn-${grn.id}`}
              >
                <Printer size={15} aria-hidden="true" />
                Print Official GRN
              </button>
              <button
                type="button"
                className={styles.actionBtnSuccess}
                onClick={() => onPrint('receipt', grn.id)}
                disabled={printingId === `receipt-${grn.id}`}
              >
                <FileText size={15} aria-hidden="true" />
                Print Inward Receipt
              </button>
            </>
          )}
          {grn.status === 'OPEN' && canAllocate && (
            <Link
              href={`/inventory?grnId=${encodeURIComponent(grn.id)}`}
              className={styles.primaryBtn}
            >
              <ArrowRight size={15} aria-hidden="true" />
              Put-Away Bags
            </Link>
          )}
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
