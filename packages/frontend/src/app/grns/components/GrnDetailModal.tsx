'use client';

import React from 'react';
import { ArrowRightLeft, Edit2, FileText, Printer, Truck } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  onClose: () => void;
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onManageLoan?: (grn: Grn) => void;
  onCorrect?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
}

export function GrnDetailModal({
  grn,
  onClose,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  onPrint,
  onManageLoan,
  onCorrect,
  onCreateChallan,
  onInternalMove,
}: GrnDetailModalProps) {
  const isBonded = grn.isBondForLoan || (grn.loanStatus && grn.loanStatus !== 'NONE');
  const bondNumberDisplay = isBonded ? (grn.bondNumber || grn.grnNumber) : null;
  const loanBadgeVariant = grn.loanStatus === 'TAKEN' ? 'danger' : grn.loanStatus === 'CLEARED' ? 'success' : 'neutral';
  const loanBadgeText =
    !isBonded || grn.loanStatus === 'NONE'
      ? 'Standard Storage'
      : grn.loanStatus === 'TAKEN'
        ? 'Loan Active (Hold)'
        : grn.loanStatus === 'CLEARED'
          ? 'Loan Cleared'
          : 'Pledged (Loan Not Taken)';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Acknowledgement Details: ${grn.grnNumber}`}
      subtitle={`Inward Receipt #${grn.inwardReceiptNumber}${bondNumberDisplay ? ` • Bond #${bondNumberDisplay}` : ''}`}
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
                title={
                  (grn.netDeliveredBags ?? 0) > 0
                    ? 'Stock has moved — only chamber may be corrected; reverse active deliveries first'
                    : 'Edit / Correct GRN details'
                }
                leftIcon={<Edit2 size={13} aria-hidden="true" />}
              >
                Edit
              </Button>
            )}
            {canInternalMove && onInternalMove && grn.status === 'OPEN' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onInternalMove(grn)}
                disabled={grn.loanStatus === 'TAKEN'}
                title={grn.loanStatus === 'TAKEN' ? 'Movement blocked — Active loan hold' : 'Internal Move'}
                leftIcon={<ArrowRightLeft size={13} aria-hidden="true" />}
              >
                Internal Move
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
                {new Date(grn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
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
                {bondNumberDisplay ? (
                  <strong style={{ color: 'var(--color-primary)' }}>{bondNumberDisplay}</strong>
                ) : (
                  'None — Standard Storage'
                )}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Loan Status</span>
              <span className={styles.detailValue}>
                <Badge variant={loanBadgeVariant}>{loanBadgeText}</Badge>
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
              <span className={styles.detailValue}>{grn.chamber}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Bags Accounting</span>
              <span className={styles.detailValue}>
                Total S/B Bags: {grn.bags.toLocaleString('en-IN')} (S/B: {grn.bagType})
                {grn.netDeliveredBags != null && grn.netDeliveredBags > 0 ? (
                  <> • {grn.netDeliveredBags.toLocaleString('en-IN')} Outward • {(grn.closingBags ?? (grn.bags - grn.netDeliveredBags)).toLocaleString('en-IN')} Bal</>
                ) : null}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Rent Structure</span>
              <span className={styles.detailValue}>
                {grn.rentType}
                {grn.rentType === 'Monthly' && grn.rentMonths
                  ? ` (${grn.rentMonths} Months, info only)`
                  : ''}{' '}
                —{' '}
                {grn.rentType === 'Monthly' && (grn.rentAmount == null || grn.rentAmount === 0)
                  ? 'Dynamic (Cycle Billing)'
                  : `₹${(grn.rentAmount ?? 0).toLocaleString('en-IN')}`}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Gate Pass (GP) #</span>
              <span className={styles.detailValue}>{grn.gpNumber || 'None'}</span>
            </div>

            <div className={styles.detailItem}>
              {/* Storage Mark is not a stored duplicate; the GR Number is displayed instead. */}
              <span className={styles.detailLabel}>Storage Mark</span>
              <span className={styles.detailValue}>{grn.grnNumber}</span>
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
