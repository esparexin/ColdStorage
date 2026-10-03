'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
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
    <Modal
      isOpen
      onClose={onClose}
      title={`Delivery Challan: ${delivery.challanNumber}`}
      subtitle={`GRN Source: ${delivery.grnNumber}`}
      size="lg"
      footer={
        <>
          {canPrint && (
            <Button
              variant="primary"
              onClick={() => onPrintChallan(delivery.id)}
              disabled={printingId === delivery.id}
              isLoading={printingId === delivery.id}
              leftIcon={<Printer size={15} aria-hidden="true" />}
            >
              Print Delivery Challan
            </Button>
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
                <Badge variant={delivery.status === 'ISSUED' ? 'success' : 'neutral'}>
                  {delivery.status}
                </Badge>
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
    </Modal>
  );
}
