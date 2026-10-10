'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [openUpward, setOpenUpward] = useState(false);
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

  const checkPosition = useCallback(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Check closest scrollable table container or card
    const scrollParent = menuRef.current.closest('[class*="tableWrapper"]');
    let containerSpaceBelow = spaceBelow;
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      containerSpaceBelow = parentRect.bottom - rect.bottom;
    }

    // Dropdown height with 4 items is ~160-175px
    const menuEstimatedHeight = 180;
    const hasEnoughBelow = spaceBelow >= menuEstimatedHeight && containerSpaceBelow >= menuEstimatedHeight;
    const shouldOpenUp = !hasEnoughBelow && (spaceAbove > spaceBelow || spaceAbove >= menuEstimatedHeight);
    setOpenUpward(shouldOpenUp);
  }, []);

  const handleToggleMenu = () => {
    if (!menuOpen) {
      checkPosition();
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    checkPosition();

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const handleScrollOrResize = () => {
      checkPosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [menuOpen, checkPosition]);

  return (
    <div
      className={styles.actionGroup}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
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
          onClick={handleToggleMenu}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`More actions for GRN ${row.grnNumber}`}
          title="More actions"
          leftIcon={<MoreVertical size={13} aria-hidden="true" />}
        />

        {menuOpen && (
          <div
            className={`${styles.dropdownMenu} ${openUpward ? styles.dropdownMenuUpward : ''}`}
            role="menu"
          >
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

