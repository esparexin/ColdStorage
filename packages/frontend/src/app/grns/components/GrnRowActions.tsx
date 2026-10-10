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
  canInternalMove = false,
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
  const editTitle = hasMovedHint
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={styles.actionGroup}>
      {/* Primary Action 1: Edit (Only shown for open GRNs) */}
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

      {/* Primary Action 2: Internal Move (Only shown for open GRNs with stock) */}
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

      {/* 3-Dot Actions Menu (View, Print, Challan) */}
      <div className={styles.menuContainer} ref={menuRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`More actions for GRN ${row.grnNumber}`}
          title="More actions"
          leftIcon={<MoreVertical size={13} aria-hidden="true" />}
        />

        {menuOpen && (
          <div className={styles.dropdownMenu} role="menu">
            <Button
              variant="ghost"
              size="sm"
              role="menuitem"
              className={styles.menuItemBtn}
              onClick={() => {
                setMenuOpen(false);
                onSelectGrn(row);
              }}
              leftIcon={<Eye size={13} aria-hidden="true" />}
            >
              View Details
            </Button>

            {canPrint && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  className={styles.menuItemBtn}
                  disabled={printingId === `grn-${row.id}`}
                  isLoading={printingId === `grn-${row.id}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onPrint('grn', row.id);
                  }}
                  leftIcon={<Printer size={13} aria-hidden="true" />}
                >
                  Print GRN
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  className={styles.menuItemBtn}
                  disabled={printingId === `receipt-${row.id}`}
                  isLoading={printingId === `receipt-${row.id}`}
                  onClick={() => {
                    setMenuOpen(false);
                    onPrint('receipt', row.id);
                  }}
                  leftIcon={<FileText size={13} aria-hidden="true" />}
                >
                  Print Receipt (Ack)
                </Button>
              </>
            )}

            {!isClosed && canCreateChallan && onCreateChallan && hasRemainingStock && (
              <Button
                variant="ghost"
                size="sm"
                role="menuitem"
                className={styles.menuItemBtn}
                disabled={isLoanHold}
                title={isLoanHold ? 'Outward blocked — Active loan hold' : 'Create Outward Challan'}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateChallan(row);
                }}
                leftIcon={<Truck size={13} aria-hidden="true" />}
              >
                Outward Challan
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

