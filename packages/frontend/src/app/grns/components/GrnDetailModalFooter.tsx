'use client';

import React from 'react';
import { ArrowRightLeft, FileText, Printer, Truck } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

interface GrnDetailModalFooterProps {
  grn: Grn;
  onClose: () => void;
  canPrint: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onManageLoan?: (grn: Grn) => void;
}

export function GrnDetailModalFooter({
  grn,
  onClose,
  canPrint,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  onPrint,
  onCreateChallan,
  onInternalMove,
  onManageLoan,
}: GrnDetailModalFooterProps) {
  return (
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
        disabled={
          !canInternalMove ||
          !onInternalMove ||
          grn.status !== 'OPEN' ||
          grn.loanStatus === 'TAKEN' ||
          (grn.closingBags ?? grn.bags) <= 0
        }
        title={
          grn.loanStatus === 'TAKEN'
            ? 'Movement blocked — Active loan hold'
            : (grn.closingBags ?? grn.bags) <= 0
              ? 'Movement blocked — Stock exhausted'
              : 'Internal Move'
        }
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
  );
}
