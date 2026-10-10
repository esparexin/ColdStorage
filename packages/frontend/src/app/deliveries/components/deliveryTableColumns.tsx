import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
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
      header: 'Challan # / Date',
      render: (row) => (
        <div className={styles.challanCell}>
          <span className={styles.challanNumber}>{row.challanNumber}</span>
          <span className={styles.dateSub}>
            {new Date(row.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
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
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          <span className={styles.grnCommodityChamber}>
            {row.commodityName} • Ch {row.chamber}
          </span>
        </div>
      ),
    },
    {
      key: 'totalBags',
      header: 'Delivered Bags',
      align: 'right',
      render: (row) => (
        <div className={styles.bagsCell}>
          <span className={styles.bagsTotal}>
            {row.totalBags.toLocaleString('en-IN')} bags
          </span>
          {row.smallBags > 0 && row.bigBags > 0 ? (
            <span className={styles.bagsSplit}>
              {row.smallBags.toLocaleString('en-IN')}s / {row.bigBags.toLocaleString('en-IN')}b
            </span>
          ) : row.bagType && row.bagType !== 'S/B' ? (
            <span className={styles.bagsSplit}>
              Type: {row.bagType}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Outward Weight',
      align: 'right',
      render: (row) => (
        <span className={styles.weightCell}>
          {row.weight != null ? `${row.weight.toLocaleString('en-IN')} kg` : '—'}
        </span>
      ),
    },
    {
      key: 'remainingBags',
      header: 'Remaining Bags',
      align: 'right',
      render: (row) => {
        const remainingTotal = row.remainingTotalBags;
        if (remainingTotal === undefined) {
          return <span className={styles.textMuted}>—</span>;
        }

        const isClosed = remainingTotal === 0;

        return (
          <div className={styles.remainingCell}>
            <div className={styles.remainingMain}>
              <span className={isClosed ? styles.textMuted : styles.remainingActive}>
                {remainingTotal.toLocaleString('en-IN')} bags
              </span>
              {isClosed && (
                <Badge variant="neutral">
                  Closed
                </Badge>
              )}
            </div>
            {!isClosed && row.originalBags !== undefined && (
              <span className={styles.origBagsSub}>
                of {row.originalBags.toLocaleString('en-IN')} orig
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'rentStatus',
      header: 'Rent Status',
      render: (row) => {
        if (!row.rentPaymentStatus && !row.rentCharge) {
          return <span className={styles.textMuted}>—</span>;
        }
        const isSettled = row.rentPaymentStatus === 'Settled';
        return (
          <div className={styles.rentCell}>
            {row.rentPaymentStatus && (
              <Badge variant={isSettled ? 'success' : 'warning'}>
                {isSettled ? 'Settled' : `₹${(row.rentRemainingBalance ?? 0).toLocaleString('en-IN')} due`}
              </Badge>
            )}
            {row.rentCharge != null && row.rentCharge > 0 && (
              <span className={styles.rentChargeSub}>
                Rent: ₹{row.rentCharge.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge
          variant={row.status === 'ISSUED' ? 'success' : 'neutral'}
          icon={row.status === 'ISSUED' ? <CheckCircle2 size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}
        >
          {row.status === 'ISSUED' ? 'Issued' : 'Reversed'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
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
