import React from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
import {
  isDeliveryPartiallyPaid,
  isDeliverySettled,
  isDeliveryUnsettled,
} from '../hooks/deliveryFilter.helper';
import { DeliveryRowActions } from './DeliveryRowActions';
import styles from './DeliveryTable.module.css';

interface CreateDeliveryColumnsParams {
  canPrint: boolean;
  canCollectRent?: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
}

export function createDeliveryColumns({
  canPrint,
  canCollectRent,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
}: CreateDeliveryColumnsParams): DataTableColumn<DeliveryChallan>[] {
  return [
    {
      key: 'challanNumber',
      header: 'Challan #',
      render: (row) => (
        <span className={styles.challanNumber}>{row.challanNumber}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className={styles.dateSub}>
          {new Date(row.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <span className={styles.grnNumber}>{row.grnNumber}</span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <span className={styles.customerCell}>{row.customerName}</span>
      ),
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => <span>{row.commodityName}</span>,
    },
    {
      key: 'bagsSb',
      header: 'Bags (S/B)',
      align: 'right',
      render: (row) => {
        const isModern =
          row.bagCategory === 'Modern' || row.bagCategory === 'Modern Size';
        if (isModern) {
          return (
            <span className={styles.bagsTotal}>
              {row.totalBags.toLocaleString('en-IN')} Modern
            </span>
          );
        }
        return (
          <span className={styles.bagsTotal}>
            {row.totalBags.toLocaleString('en-IN')} ({row.smallBags.toLocaleString('en-IN')}S/
            {row.bigBags.toLocaleString('en-IN')}B)
          </span>
        );
      },
    },
    {
      key: 'rentStatus',
      header: 'Rent Status',
      render: (row) => {
        if (isDeliverySettled(row)) {
          return <Badge variant="success">Settled</Badge>;
        }
        if (isDeliveryPartiallyPaid(row)) {
          return <Badge variant="warning">Partial</Badge>;
        }
        if (isDeliveryUnsettled(row)) {
          return <Badge variant="warning">Unsettled</Badge>;
        }
        if (row.status === 'REVERSED') {
          return <Badge variant="neutral">Reversed</Badge>;
        }
        return <span className={styles.textMuted}>—</span>;
      },
    },
    {
      key: 'actions',
      header: '·',
      align: 'right',
      render: (row) => (
        <DeliveryRowActions
          row={row}
          canPrint={canPrint}
          canCollectRent={canCollectRent}
          printingId={printingId}
          onSelectDelivery={onSelectDelivery}
          onPrintChallan={onPrintChallan}
          onCollectRent={onCollectRent}
        />
      ),
    },
  ];
}
