'use client';

import React from 'react';
import { Eye, IndianRupee, Printer, RotateCcw } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { Button, OverflowMenu, type OverflowMenuItem } from '@/components/ui';
import styles from './DeliveryRowActions.module.css';

interface DeliveryRowActionsProps {
  row: DeliveryChallan;
  canPrint: boolean;
  canCollectRent?: boolean;
  canReverse?: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
  onReverseDelivery?: (delivery: DeliveryChallan) => void;
}

export function DeliveryRowActions({
  row,
  canPrint,
  canCollectRent = false,
  canReverse = false,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
  onReverseDelivery,
}: DeliveryRowActionsProps) {
  const hasPendingRent =
    row.rentPaymentStatus !== 'Settled' && (row.rentRemainingBalance ?? 1) > 0;
  const isPrinting = printingId === row.id;

  const menuItems: OverflowMenuItem[] = [
    {
      key: 'view',
      id: `delivery-action-view-${row.id}`,
      label: 'View Details',
      icon: <Eye size={13} aria-hidden="true" />,
      onClick: () => onSelectDelivery(row),
    },
    ...(canPrint
      ? [
          {
            key: 'print',
            id: `delivery-action-print-${row.id}`,
            label: isPrinting ? 'Printing…' : 'Challan',
            icon: <Printer size={13} aria-hidden="true" />,
            disabled: isPrinting,
            onClick: () => onPrintChallan(row.id),
          },
        ]
      : []),
    ...(canReverse && onReverseDelivery && row.status === 'ISSUED'
      ? [
          {
            key: 'reverse',
            id: `delivery-action-reverse-${row.id}`,
            label: 'Reverse Delivery',
            icon: <RotateCcw size={13} aria-hidden="true" />,
            onClick: () => onReverseDelivery(row),
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
      {/* Primary Contextual Action: Collect Rent */}
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

      {/* 3-Dot Actions Menu */}
      <OverflowMenu
        id={`delivery-menu-btn-${row.id}`}
        items={menuItems}
        ariaLabel={`More actions for delivery challan ${row.challanNumber}`}
      />
    </div>
  );
}
