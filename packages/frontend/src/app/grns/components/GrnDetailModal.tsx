'use client';

import React from 'react';
import { Edit2, FileText, Printer, Truck } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  onClose: () => void;
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onManageLoan?: (grn: Grn) => void;
  onCorrect?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
}

export function GrnDetailModal({
  grn,
  onClose,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  printingId,
  onPrint,
  onManageLoan,
  onCorrect,
  onCreateChallan,
}: GrnDetailModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Acknowledgement Details: ${grn.grnNumber}`}
      subtitle={`Inward Receipt #${grn.inwardReceiptNumber}${grn.bondNumber ? ` • Bond #${grn.bondNumber}` : ''}`}
      size="lg"
      footer={
        <div className={styles.detailModalFooter}>
          {onManageLoan && (
            <div className={styles.detailFooterLeft}>
              <Button
                variant={grn.loanStatus === 'TAKEN' ? 'danger' : 'outline'}
                size="sm"
                onClick={() => onManageLoan(grn)}
              >
                {grn.loanStatus === 'TAKEN' ? '⚠️ Loan Active — Manage' : 'Manage Loan Status'}
              </Button>
            </div>
          )}
          <div className={styles.detailFooterRight}>
            {canPrint && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onPrint('grn', grn.id)}
                  disabled={printingId === `grn-${grn.id}`}
                  isLoading={printingId === `grn-${grn.id}`}
                  leftIcon={<Printer size={13} aria-hidden="true" />}
                >
                  Print GRN
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onPrint('receipt', grn.id)}
                  disabled={printingId === `receipt-${grn.id}`}
                  isLoading={printingId === `receipt-${grn.id}`}
                  leftIcon={<FileText size={13} aria-hidden="true" />}
                >
                  Print Receipt
                </Button>
              </>
            )}
            {canCorrect && onCorrect && grn.status !== 'CLOSED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCorrect(grn)}
                title="Edit / Correct GRN details"
                leftIcon={<Edit2 size={13} aria-hidden="true" />}
              >
                Edit
              </Button>
            )}
            {canCreateChallan && onCreateChallan && grn.status === 'OPEN' && (grn.closingBags ?? grn.bags) > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCreateChallan(grn)}
                disabled={grn.loanStatus === 'TAKEN'}
                title={grn.loanStatus === 'TAKEN' ? 'Outward blocked — Active loan hold' : 'Create Outward Challan'}
                leftIcon={<Truck size={13} aria-hidden="true" />}
              >
                Challan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
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
              <span className={styles.detailLabel}>Physical Status</span>
              <span className={styles.detailValue}>
                <Badge variant={grn.status === 'OPEN' ? 'warning' : 'neutral'}>
                  {grn.status}
                </Badge>
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Bond Number</span>
              <span className={styles.detailValue}>
                {grn.bondNumber ? (
                  <strong style={{ color: 'var(--color-primary)' }}>{grn.bondNumber}</strong>
                ) : (
                  'None — Standard Storage'
                )}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Loan Status</span>
              <span className={styles.detailValue}>
                <Badge
                  variant={
                    grn.loanStatus === 'TAKEN'
                      ? 'danger'
                      : grn.loanStatus === 'CLEARED'
                        ? 'success'
                        : 'neutral'
                  }
                >
                  {grn.loanStatus === 'TAKEN'
                    ? 'Loan Active (Hold)'
                    : grn.loanStatus === 'CLEARED'
                      ? 'Loan Cleared'
                      : grn.loanStatus === 'NOT_TAKEN'
                        ? 'Loan Not Taken (Pledged)'
                        : 'Standard Storage'}
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
              <span className={styles.detailLabel}>Storage Mark</span>
              <span className={styles.detailValue}>{grn.storageMark || 'None'}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Party Mark</span>
              <span className={styles.detailValue}>{grn.partyMark || 'None'}</span>
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
