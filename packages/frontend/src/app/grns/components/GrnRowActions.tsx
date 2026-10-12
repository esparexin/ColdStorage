'use client';

import React from 'react';
import {
  ArrowRightLeft,
  Edit2,
  Eye,
  FileText,
  Printer,
  Truck,
} from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Button, OverflowMenu, type OverflowMenuItem } from '@/components/ui';
import styles from './GrnRowActions.module.css';

interface GrnRowActionsProps {
  row: Grn;
  canCorrect: boolean;
  canCreateChallan: boolean;
  canInternalMove?: boolean;
  canPrint: boolean;
  printingId: string | null;
  onSelectGrn: (grn: Grn) => void;
  onCorrectGrn?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', id: string) => void;
}

export function GrnRowActions({
  row,
  canCorrect,
  canCreateChallan,
  canInternalMove = false,
  canPrint,
  printingId,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onInternalMove,
  onPrint,
}: GrnRowActionsProps) {
  const isClosed = row.status === 'CLOSED';
  const hasMovedHint = (row.netDeliveredBags ?? 0) > 0;
  const editTitle = hasMovedHint
    ? 'Stock has moved — core identity is locked; chamber, marks and logistics may be edited'
    : 'Edit GRN';
  const hasRemainingStock = (row.closingBags ?? row.bags) > 0;
  const isLoanHold = row.loanStatus === 'TAKEN';

  const menuItems: OverflowMenuItem[] = [
    {
      key: 'view',
      label: 'View Details',
      icon: <Eye size={13} aria-hidden="true" />,
      onClick: () => onSelectGrn(row),
    },
    ...(canPrint
      ? [
          {
            key: 'print-grn',
            label: printingId === `grn-${row.id}` ? 'Printing…' : 'Print GRN',
            icon: <Printer size={13} aria-hidden="true" />,
            disabled: printingId === `grn-${row.id}`,
            onClick: () => onPrint('grn', row.id),
          },
          {
            key: 'print-receipt',
            label:
              printingId === `receipt-${row.id}`
                ? 'Printing…'
                : 'Print Receipt (Ack)',
            icon: <FileText size={13} aria-hidden="true" />,
            disabled: printingId === `receipt-${row.id}`,
            onClick: () => onPrint('receipt', row.id),
          },
        ]
      : []),
    ...(!isClosed && canCreateChallan && onCreateChallan && hasRemainingStock
      ? [
          {
            key: 'create-challan',
            label: 'Outward Challan',
            icon: <Truck size={13} aria-hidden="true" />,
            disabled: isLoanHold,
            title: isLoanHold
              ? 'Outward blocked — Active loan hold'
              : 'Create Outward Challan',
            onClick: () => onCreateChallan(row),
          },
        ]
      : []),
  ];

  return (
    <div
      className={styles.actionGroup}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Primary Action 1: Edit */}
      {!isClosed && canCorrect && onCorrectGrn && (
        <Button
          variant="outline"
          size="sm"
          title={editTitle}
          aria-label={`Edit GRN ${row.grnNumber}`}
          onClick={() => onCorrectGrn(row)}
          leftIcon={<Edit2 size={12} aria-hidden="true" />}
        >
          Edit
        </Button>
      )}

      {/* Primary Action 2: Internal Move */}
      {!isClosed && canInternalMove && onInternalMove && (
        <Button
          variant="outline"
          size="sm"
          disabled={isLoanHold}
          title={isLoanHold ? 'Movement blocked — Loan hold' : 'Internal Move'}
          aria-label={`Internal move for GRN ${row.grnNumber}`}
          onClick={() => onInternalMove(row)}
          leftIcon={<ArrowRightLeft size={12} aria-hidden="true" />}
        >
          Move
        </Button>
      )}

      {/* 3-Dot Actions Menu */}
      <OverflowMenu
        items={menuItems}
        ariaLabel={`More actions for GRN ${row.grnNumber}`}
      />
    </div>
  );
}
