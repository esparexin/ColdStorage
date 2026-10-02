'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface DeliveryDetailModalProps {
  delivery: DeliveryChallan;
  onClose: () => void;
  canPrint: boolean;
  printingId: string | null;
  onPrintChallan: (challanId: string) => void;
}

export function DeliveryDetailModal({
  delivery,
  onClose,
  canPrint,
  printingId,
  onPrintChallan,
}: DeliveryDetailModalProps) {
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-detail-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <h2 id="delivery-detail-title" className={styles.modalTitle}>
              Delivery Challan: {delivery.challanNumber}
            </h2>
            <span className={styles.dateSub}>GRN Source: {delivery.grnNumber}</span>
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
              <span className={styles.detailLabel}>Delivery Date</span>
              <span className={styles.detailValue}>
                {new Date(delivery.date).toLocaleDateString('en-IN', {
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
                    delivery.status === 'ISSUED'
                      ? styles.badgeIssued
                      : styles.badgeReversed
                  }
                >
                  {delivery.status}
                </span>
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Customer</span>
              <span className={styles.detailValue}>{delivery.customerName}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Commodity</span>
              <span className={styles.detailValue}>{delivery.commodityName}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Chamber</span>
              <span className={styles.detailValue}>Chamber {delivery.chamberNumber}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Total Delivered Bags</span>
              <span className={styles.detailValue}>
                {delivery.totalBags.toLocaleString('en-IN')} Bags
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Vehicle Number</span>
              <span className={styles.detailValue}>{delivery.vehicleNumber || 'None'}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Driver Name</span>
              <span className={styles.detailValue}>{delivery.driverName || 'None'}</span>
            </div>

            <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
              <span className={styles.detailLabel}>Remarks</span>
              <span className={styles.detailValue}>{delivery.remarks || 'None'}</span>
            </div>
          </div>

          <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', marginTop: 'var(--space-4)' }}>
            Withdrawn Positions ({delivery.items.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {delivery.items.map((item) => (
              <div
                key={item.positionId}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-surface-2)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {item.positionCode}
                </span>
                <span style={{ fontWeight: 600 }}>{item.bags} bags withdrawn</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalFooter}>
          {canPrint && (
            <button
              type="button"
              className={styles.actionBtnPrimary}
              onClick={() => onPrintChallan(delivery.id)}
              disabled={printingId === delivery.id}
            >
              <Printer size={15} aria-hidden="true" />
              Print Delivery Challan
            </button>
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
