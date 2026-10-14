'use client';

import React, { useMemo } from 'react';
import { ArrowRightLeft, Edit2, FileText, Printer, Truck } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Badge, Button, Modal } from '@/components/ui';
import { GrnMergedDetailsTable } from './GrnMergedDetailsTable';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  allGrns?: Grn[];
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
  allGrns = [],
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
  const loanBadgeVariant = grn.loanStatus === 'TAKEN' ? 'danger' : grn.loanStatus === 'CLEARED' ? 'success' : 'neutral';
  const loanBadgeText =
    !isBonded || grn.loanStatus === 'NONE'
      ? 'Standard Storage'
      : grn.loanStatus === 'TAKEN'
        ? 'Loan Active (Hold)'
        : grn.loanStatus === 'CLEARED'
          ? 'Loan Cleared'
          : 'Pledged (Loan Not Taken)';

  const cleanedRemarks = useMemo(() => {
    return (grn.remarks ?? '')
      .replace(/\[(MERGE RECEIVED|MERGED into|OWNERSHIP TRANSFERRED)[^\]]*\]/gi, '')
      .trim();
  }, [grn.remarks]);

  // Extract merged source details from remarks (the SSOT for actual moved bag counts) and allGrns
  const mergedDetails = useMemo(() => {
    const list: Array<{
      grnNumber: string;
      bags: number;
      chamber?: string | null;
      storageMark?: string | null;
      partyMark?: string | null;
    }> = [];
    const seenGrnNumbers = new Set<string>();

    // 1. Parse merge records from remarks — this contains the exact bags transferred
    const remarks = grn.remarks ?? '';
    const mergeRx = /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags from (?:GRN\s+)?([^\s(]+)(?:\s*\(([^)]+)\))?\.\s*Reason:\s*([^\]]+)\]/gi;
    let match: RegExpExecArray | null;
    while ((match = mergeRx.exec(remarks)) !== null) {
      const [, , bagsStr, sourceGrnNum] = match;
      if (!seenGrnNumbers.has(sourceGrnNum)) {
        seenGrnNumbers.add(sourceGrnNum);
        const sourceGrn = allGrns.find((g) => g.grnNumber === sourceGrnNum);
        list.push({
          grnNumber: sourceGrnNum,
          bags: Number(bagsStr) || 0,
          chamber: sourceGrn?.chamber || null,
          storageMark: sourceGrn?.storageMark || sourceGrnNum,
          partyMark: sourceGrn?.partyMark || null,
        });
      }
    }

    // 2. Also check allGrns for any merged source lots not captured in remarks
    for (const g of allGrns) {
      if (
        (g.mergedIntoGrnNumber === grn.grnNumber || (g.mergedIntoGrnId && g.mergedIntoGrnId === grn.id)) &&
        !seenGrnNumbers.has(g.grnNumber)
      ) {
        seenGrnNumbers.add(g.grnNumber);
        list.push({
          grnNumber: g.grnNumber,
          bags: g.bags,
          chamber: g.chamber || null,
          storageMark: g.storageMark || g.grnNumber,
          partyMark: g.partyMark || null,
        });
      }
    }

    return list;
  }, [allGrns, grn]);

  const hasMerged = mergedDetails.length > 0;

  // After merging, display the active GRN number as the Bond Number.
  // If not merged and not bonded, display 'None'.
  const bondNumberDisplay = hasMerged
    ? grn.grnNumber
    : isBonded
      ? (grn.bondNumber || grn.grnNumber)
      : 'None';

  const mergedChambers = useMemo(() => {
    const set = new Set<string>();
    for (const m of mergedDetails) {
      if (m.chamber && m.chamber !== grn.chamber) {
        set.add(m.chamber);
      }
    }
    return Array.from(set);
  }, [mergedDetails, grn.chamber]);

  const mergedStorageMarks = useMemo(() => {
    const set = new Set<string>();
    for (const m of mergedDetails) {
      const mark = m.storageMark || m.grnNumber;
      if (mark && mark !== grn.grnNumber) {
        set.add(mark);
      }
    }
    return Array.from(set);
  }, [mergedDetails, grn.grnNumber]);

  const mergedPartyMarks = useMemo(() => {
    const set = new Set<string>();
    for (const m of mergedDetails) {
      if (m.partyMark && m.partyMark !== grn.partyMark) {
        set.add(m.partyMark);
      }
    }
    return Array.from(set);
  }, [mergedDetails, grn.partyMark]);

  const totalMergedBags = useMemo(() => {
    return mergedDetails.reduce((sum, m) => sum + (m.bags || 0), 0);
  }, [mergedDetails]);

  const activeInitialBags = useMemo(() => {
    return Math.max(0, grn.bags - totalMergedBags);
  }, [grn.bags, totalMergedBags]);

  const bagsBreakdown = useMemo(() => {
    if (!hasMerged || totalMergedBags === 0) return null;
    return `${activeInitialBags.toLocaleString('en-IN')} + ${totalMergedBags.toLocaleString('en-IN')}`;
  }, [hasMerged, activeInitialBags, totalMergedBags]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Acknowledgement Details: ${grn.grnNumber}`}
      headerActions={
        canCorrect && onCorrect && grn.status !== 'CLOSED' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCorrect(grn)}
            aria-label="Edit GRN details"
            title={
              (grn.netDeliveredBags ?? 0) > 0
                ? 'Stock has moved — only chamber may be corrected; reverse active deliveries first'
                : 'Edit / Correct GRN details'
            }
            leftIcon={<Edit2 size={16} aria-hidden="true" />}
          />
        ) : null
      }
      size="lg"
      footer={
        <div className={styles.detailModalFooterGrid}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onPrint('grn', grn.id)}
            disabled={!canPrint || printingId === `grn-${grn.id}`}
            isLoading={printingId === `grn-${grn.id}`}
            leftIcon={<Printer size={13} aria-hidden="true" />}
          >
            Print GRN
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPrint('receipt', grn.id)}
            disabled={!canPrint || printingId === `receipt-${grn.id}`}
            isLoading={printingId === `receipt-${grn.id}`}
            leftIcon={<FileText size={13} aria-hidden="true" />}
          >
            Print Receipt
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCreateChallan && onCreateChallan(grn)}
            disabled={
              !canCreateChallan ||
              !onCreateChallan ||
              grn.status !== 'OPEN' ||
              (grn.closingBags ?? grn.bags) <= 0 ||
              grn.loanStatus === 'TAKEN'
            }
            title={grn.loanStatus === 'TAKEN' ? 'Outward blocked — Active loan hold' : 'Create Outward Challan'}
            leftIcon={<Truck size={13} aria-hidden="true" />}
          >
            Challan
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onInternalMove && onInternalMove(grn)}
            disabled={!canInternalMove || !onInternalMove || grn.status !== 'OPEN' || grn.loanStatus === 'TAKEN' || (grn.closingBags ?? grn.bags) <= 0}
            title={grn.loanStatus === 'TAKEN' ? 'Movement blocked — Active loan hold' : (grn.closingBags ?? grn.bags) <= 0 ? 'Movement blocked — Stock exhausted' : 'Internal Move'}
            leftIcon={<ArrowRightLeft size={13} aria-hidden="true" />}
          >
            Internal Move
          </Button>
          <Button
            variant={grn.loanStatus === 'TAKEN' ? 'danger' : 'outline'}
            size="sm"
            onClick={() => onManageLoan && onManageLoan(grn)}
            disabled={!onManageLoan}
            title="Manage Loan Status"
          >
            {grn.loanStatus === 'TAKEN' ? '⚠️ Loan Active' : 'Manage Loan Status'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
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
                {bondNumberDisplay !== 'None' ? (
                  <strong style={{ color: 'var(--color-primary-text)' }}>{bondNumberDisplay}</strong>
                ) : (
                  'None'
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
              <span className={styles.detailValue}>
                <strong>{grn.chamber}</strong>
                {mergedChambers.length > 0 && (
                  <span className={styles.mergedSubValue}> ({mergedChambers.join(', ')})</span>
                )}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Total Bags</span>
              <span className={styles.detailValue}>
                <strong>{grn.bags.toLocaleString('en-IN')} bags</strong>
                {bagsBreakdown && (
                  <span className={styles.mergedSubValue}> ({bagsBreakdown})</span>
                )}
                {grn.netDeliveredBags != null && grn.netDeliveredBags > 0 ? (
                  <> • {grn.netDeliveredBags.toLocaleString('en-IN')} Outward • {(grn.closingBags ?? (grn.bags - grn.netDeliveredBags)).toLocaleString('en-IN')} Bal</>
                ) : null}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Rent Structure</span>
              <span className={styles.detailValue}>
                {grn.rentType}
                {grn.rentType === 'Monthly' && grn.rentMonths ? ` (${grn.rentMonths} Months, info only)` : ''} —{' '}
                {grn.rentType === 'Monthly' && (grn.rentAmount == null || grn.rentAmount === 0)
                  ? 'Dynamic (Cycle Billing)'
                  : `₹${(grn.rentAmount ?? 0).toLocaleString('en-IN')}`}
              </span>
            </div>

            {(grn.smallBagPrice != null || grn.bigBagPrice != null || (grn.bagPrice != null && grn.bagPrice > 0)) && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Agreed Rates</span>
                <span className={styles.detailValue}>
                  {grn.smallBagPrice != null || grn.bigBagPrice != null
                    ? [grn.smallBagPrice != null ? `Small: ₹${grn.smallBagPrice.toFixed(2)}` : null, grn.bigBagPrice != null ? `Big: ₹${grn.bigBagPrice.toFixed(2)}` : null].filter(Boolean).join(' • ')
                    : `₹${(grn.bagPrice ?? 0).toFixed(2)} / bag`}
                </span>
              </div>
            )}

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Gate Pass (GP) #</span>
              <span className={styles.detailValue}>{grn.gpNumber || 'None'}</span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Storage Mark</span>
              <span className={styles.detailValue}>
                <strong>{grn.grnNumber}</strong>
                {mergedStorageMarks.length > 0 && (
                  <span className={styles.mergedSubValue}> ({mergedStorageMarks.join(', ')})</span>
                )}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Party Mark</span>
              <span className={styles.detailValue}>
                <strong>{grn.partyMark || 'None'}</strong>
                {mergedPartyMarks.length > 0 && (
                  <span className={styles.mergedSubValue}> ({mergedPartyMarks.join(', ')})</span>
                )}
              </span>
            </div>

            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Vehicle No.</span>
              <span className={styles.detailValue}>
                {grn.vehicleNumber || 'None'}
              </span>
            </div>

            <div className={`${styles.detailItem} ${styles.span2}`}>
              <span className={styles.detailLabel}>Operator Remarks</span>
              <span className={styles.detailValue}>{cleanedRemarks || 'None'}</span>
            </div>
          </div>
          <GrnMergedDetailsTable currentGrn={grn} allGrns={allGrns} />
        </div>
    </Modal>
  );
}
