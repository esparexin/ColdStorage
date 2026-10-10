'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, IndianRupee, MoreVertical, Printer } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from './DeliveryRowActions.module.css';

interface DeliveryRowActionsProps {
  row: DeliveryChallan;
  canPrint: boolean;
  canCollectRent?: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
}

export function DeliveryRowActions({
  row,
  canPrint,
  canCollectRent = false,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
}: DeliveryRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasPendingRent =
    row.rentPaymentStatus !== 'Settled' && (row.rentRemainingBalance ?? 1) > 0;
  const isPrinting = printingId === row.id;

  const checkPosition = useCallback(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const scrollParent = menuRef.current.closest('[class*="tableWrapper"]');
    let containerSpaceBelow = spaceBelow;
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      containerSpaceBelow = parentRect.bottom - rect.bottom;
    }

    const menuEstimatedHeight = 120;
    const hasEnoughBelow =
      spaceBelow >= menuEstimatedHeight && containerSpaceBelow >= menuEstimatedHeight;
    const shouldOpenUp =
      !hasEnoughBelow && (spaceAbove > spaceBelow || spaceAbove >= menuEstimatedHeight);
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
      {/* Primary Contextual Action: Collect Rent (Only shown when rent is pending and user has permission) */}
      {hasPendingRent && canCollectRent && onCollectRent && (
        <Button
          id={`collect-rent-${row.id}`}
          variant="secondary"
          size="sm"
          onClick={() => onCollectRent(row)}
          title="Collect pending rent for this delivery"
          aria-label={`Collect pending rent for delivery challan ${row.challanNumber}`}
          leftIcon={<IndianRupee size={12} aria-hidden="true" />}
        >
          Collect Rent
        </Button>
      )}

      {/* 3-Dot Actions Menu (View Details, Print Challan) */}
      <div className={styles.menuContainer} ref={menuRef}>
        <Button
          id={`delivery-menu-btn-${row.id}`}
          variant="outline"
          size="sm"
          onClick={handleToggleMenu}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`More actions for delivery challan ${row.challanNumber}`}
          title="More actions"
          leftIcon={<MoreVertical size={13} aria-hidden="true" />}
        />

        {menuOpen && (
          <div
            className={`${styles.dropdownMenu} ${openUpward ? styles.dropdownMenuUpward : ''}`}
            role="menu"
            aria-label={`Actions for challan ${row.challanNumber}`}
          >
            <Button
              id={`delivery-action-view-${row.id}`}
              variant="ghost"
              size="sm"
              role="menuitem"
              className={styles.menuItemBtn}
              onClick={() => {
                setMenuOpen(false);
                onSelectDelivery(row);
              }}
              leftIcon={<Eye size={13} aria-hidden="true" />}
            >
              View Details
            </Button>

            {canPrint && (
              <Button
                id={`delivery-action-print-${row.id}`}
                variant="ghost"
                size="sm"
                role="menuitem"
                className={styles.menuItemBtn}
                disabled={isPrinting}
                isLoading={isPrinting}
                onClick={() => {
                  setMenuOpen(false);
                  onPrintChallan(row.id);
                }}
                leftIcon={<Printer size={13} aria-hidden="true" />}
              >
                Challan
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
