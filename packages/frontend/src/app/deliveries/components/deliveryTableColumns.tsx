import React from 'react';
import { isHybridBagCategory, type DeliveryChallan } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
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
  canReverse?: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
  onReverseDelivery?: (delivery: DeliveryChallan) => void;
}

export function createDeliveryColumns({
  canPrint,
  canCollectRent,
  canReverse,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
  onReverseDelivery,
}: CreateDeliveryColumnsParams): DataTableColumn<DeliveryChallan>[] {
  return [
    {
      key: 'challanNumber',
      header: 'Challan #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.challanNumber,
      render: (row) => <span className={styles.challanNumber}>{row.challanNumber}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) => row.date,
      render: (row) => <span className={styles.dateSub}>{formatDisplayDate(row.date)}</span>,
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => <span className={styles.grnNumber}>{row.grnNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => <span className={styles.customerCell}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.commodityName,
      render: (row) => <span>{row.commodityName}</span>,
    },
    {
      key: 'bagsSb',
      header: 'Bags (S/B)',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.totalBags,
      render: (row) => {
        if (isHybridBagCategory(row.bagCategory)) {
          return (
            <span className={styles.bagsTotal}>{row.totalBags.toLocaleString('en-IN')} Hybrid</span>
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
          canReverse={canReverse}
          printingId={printingId}
          onSelectDelivery={onSelectDelivery}
          onPrintChallan={onPrintChallan}
          onCollectRent={onCollectRent}
          onReverseDelivery={onReverseDelivery}
        />
      ),
    },
  ];
}
