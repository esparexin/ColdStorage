'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Edit2,
  Eye,
  FileText,
  MoreVertical,
  Printer,
  Truck,
} from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
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
  canInternalMove,
  canPrint,
  printingId,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onInternalMove,
  onPrint,
}: GrnRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isClosed = row.status === 'CLOSED';
  // Heuristic hint only — CreateGrnModal enforces the ledger-derived rule (any
  // challan/reversal history locks structural fields; descriptive fields remain editable).
  const hasMovedHint = (row.netDeliveredBags ?? 0) > 0;
  const editTitle = isClosed
    ? 'Closed GRN cannot be edited'
    : hasMovedHint
      ? 'Stock has moved — core identity is locked; chamber, marks and logistics may be edited'
      : 'Edit GRN';
  const hasRemainingStock = (row.closingBags ?? row.bags) > 0;
  const isLoanHold = row.loanStatus === 'TAKEN';

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  return (
    <div className={styles.actionGroup}>
      {/* 3-Dot Actions Menu (View, Edit, Move) */}
      <div className={styles.menuContainer} ref={menuRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`Actions for GRN ${row.grnNumber}`}
          title="More actions"
          leftIcon={<MoreVertical size={13} aria-hidden="true" />}
        />

        {menuOpen && (
          <div className={styles.dropdownMenu} role="menu">
            <Button
              variant="ghost"
              size="sm"
              className={styles.menuItemBtn}
              onClick={() => {
                setMenuOpen(false);
                onSelectGrn(row);
              }}
              leftIcon={<Eye size={13} aria-hidden="true" />}
            >
              View
            </Button>

            {canCorrect && onCorrectGrn && (
              <Button
                variant="ghost"
                size="sm"
                className={styles.menuItemBtn}
                disabled={isClosed}
                title={editTitle}
                onClick={() => {
                  setMenuOpen(false);
                  onCorrectGrn(row);
                }}
                leftIcon={<Edit2 size={13} aria-hidden="true" />}
              >
                Edit
              </Button>
            )}

            {canInternalMove && onInternalMove && !isClosed && (
              <Button
                variant="ghost"
                size="sm"
                className={styles.menuItemBtn}
                disabled={isLoanHold}
                title={isLoanHold ? 'Movement blocked — Loan hold' : 'Internal Move'}
                onClick={() => {
                  setMenuOpen(false);
                  onInternalMove(row);
                }}
                leftIcon={<ArrowRightLeft size={13} aria-hidden="true" />}
              >
                Internal Move
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Quick Outward Challan Button */}
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

      {/* Quick Print Actions */}
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
