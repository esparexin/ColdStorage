'use client';

import React from 'react';
import { Edit2, Eye, FileText, Printer, Truck } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

interface GrnRowActionsProps {
  row: Grn;
  canCorrect: boolean;
  canCreateChallan: boolean;
  canPrint: boolean;
  printingId: string | null;
  onSelectGrn: (grn: Grn) => void;
  onCorrectGrn?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', id: string) => void;
}

export function GrnRowActions({
  row,
  canCorrect,
  canCreateChallan,
  canPrint,
  printingId,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onPrint,
}: GrnRowActionsProps) {
  const isClosed = row.status === 'CLOSED';
  const hasRemainingStock = (row.closingBags ?? row.bags) > 0;
  const isLoanHold = row.loanStatus === 'TAKEN';

  return (
    <div className={styles.actionGroup}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelectGrn(row)}
        title="View Details"
        leftIcon={<Eye size={12} aria-hidden="true" />}
      >
        View
      </Button>

      {canCorrect && onCorrectGrn && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCorrectGrn(row)}
          disabled={isClosed}
          title={isClosed ? 'Closed GRN cannot be edited' : 'Edit / Correct GRN'}
          leftIcon={<Edit2 size={12} aria-hidden="true" />}
        >
          Edit
        </Button>
      )}

      {canCreateChallan && onCreateChallan && !isClosed && hasRemainingStock && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCreateChallan(row)}
          disabled={isLoanHold}
          title={isLoanHold ? 'Outward blocked — Active loan hold' : 'Create Outward Challan'}
          leftIcon={<Truck size={12} aria-hidden="true" />}
        >
          Challan
        </Button>
      )}

      {canPrint && (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onPrint('grn', row.id)}
            disabled={printingId === `grn-${row.id}`}
            isLoading={printingId === `grn-${row.id}`}
            title="Print Official GRN"
            leftIcon={<Printer size={12} aria-hidden="true" />}
          >
            GRN
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPrint('receipt', row.id)}
            disabled={printingId === `receipt-${row.id}`}
            isLoading={printingId === `receipt-${row.id}`}
            title="Print Farmer Inward Receipt"
            leftIcon={<FileText size={12} aria-hidden="true" />}
          >
            Ack
          </Button>
        </>
      )}
    </div>
  );
}
