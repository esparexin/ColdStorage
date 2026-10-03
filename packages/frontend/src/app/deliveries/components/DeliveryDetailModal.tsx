'use client';

import React from 'react';
import Link from 'next/link';
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
          <Link href={`/inventory?grnId=${encodeURIComponent(delivery.grnId)}`}>
            <Button variant="outline">View GRN stock</Button>
          </Link>
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
              <span className={styles.detailValue}>Chamber {delivery.chamber}</span>
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

          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Bags Delivered</span>
            <span className={styles.detailValue}>{delivery.bags}</span>
          </div>
        </div>
    </Modal>
  );
}
