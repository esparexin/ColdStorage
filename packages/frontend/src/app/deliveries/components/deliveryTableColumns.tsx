import React from 'react';
import { CheckCircle2, Clock, Eye, IndianRupee, Printer, RotateCcw } from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import styles from '../page.module.css';

interface CreateDeliveryColumnsParams {
  canPrint: boolean;
  canCollectRent?: boolean;
  canReverse?: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onCollectRent?: (delivery: DeliveryChallan) => void;
  onReverse?: (delivery: DeliveryChallan) => void;
}

export function createDeliveryColumns({
  canPrint,
  canCollectRent,
  canReverse,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onCollectRent,
  onReverse,
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
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>{row.customerName}</span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-semibold)' }}>{row.grnNumber}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {row.commodityName} <span className={styles.tagChamber}>CH {row.chamber}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'totalBags',
      header: 'Delivered Bags',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
            {row.totalBags.toLocaleString('en-IN')} bags
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            S/B: {row.bagType ?? 'S/B'}
          </span>
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Outward Weight',
      align: 'right',
      render: (row) => (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: row.weight != null ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
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
        const remainingSmall = row.remainingSmallBags;
        const remainingBig = row.remainingBigBags;

        if (remainingTotal === undefined) {
          return <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>;
        }

        const isClosed = remainingTotal === 0;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
            <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: isClosed ? 'var(--color-text-muted)' : 'var(--color-primary-text)' }}>
              {remainingTotal.toLocaleString('en-IN')} bags
              {isClosed && (
                <span style={{ marginLeft: 'var(--space-1)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', background: 'var(--color-surface-2)', padding: '0 var(--space-1-5)', borderRadius: 'var(--radius-sm)' }}>
                  CLOSED
                </span>
              )}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {remainingSmall?.toLocaleString('en-IN') ?? 0} small / {remainingBig?.toLocaleString('en-IN') ?? 0} big
            </span>
            {row.originalBags !== undefined && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Orig: {row.originalBags.toLocaleString('en-IN')}
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
          return <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>;
        }
        const isSettled = row.rentPaymentStatus === 'Settled';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
            {row.rentPaymentStatus && (
              <Badge variant={isSettled ? 'success' : 'warning'}>
                {isSettled ? 'Settled' : `₹${(row.rentRemainingBalance ?? 0).toLocaleString('en-IN')} pending`}
              </Badge>
            )}
            {row.rentCharge != null && row.rentCharge > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-text)' }}>
                Rent: ₹{row.rentCharge.toLocaleString('en-IN')}
              </span>
            )}
            {!isSettled && (row.rentTotalPaid ?? 0) > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                ₹{(row.rentTotalPaid ?? 0).toLocaleString('en-IN')} paid
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'transport',
      header: 'Vehicle / Driver',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          <span>Veh: {row.vehicleNumber || '—'}</span>
          <span>Driver: {row.driverName || '—'}</span>
        </div>
      ),
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
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const hasPendingRent = row.rentPaymentStatus !== 'Settled' && (row.rentRemainingBalance ?? 1) > 0;
        return (
          <div className={styles.actionGroup}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectDelivery(row)}
              title="View Details"
              aria-label={`View details for delivery challan ${row.challanNumber}`}
              leftIcon={<Eye size={12} aria-hidden="true" />}
            >
              View
            </Button>
            {canPrint && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onPrintChallan(row.id)}
                disabled={printingId === row.id}
                isLoading={printingId === row.id}
                title="Print Outward Delivery Challan & Gate Pass"
                aria-label={`Print delivery challan ${row.challanNumber}`}
                leftIcon={<Printer size={12} aria-hidden="true" />}
              >
                Challan
              </Button>
            )}
            {hasPendingRent && canCollectRent && onCollectRent && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCollectRent(row)}
                title="Collect Pending Rent for this Delivery"
                aria-label={`Collect pending rent for delivery challan ${row.challanNumber}`}
                leftIcon={<IndianRupee size={12} aria-hidden="true" />}
              >
                Collect Rent
              </Button>
            )}
            {canReverse && onReverse && row.status === 'ISSUED' && (
              <Button
                variant="dangerOutline"
                size="sm"
                onClick={() => onReverse(row)}
                title="Reverse this delivery (restores bags to GRN balance)"
                aria-label={`Reverse delivery challan ${row.challanNumber}`}
                leftIcon={<RotateCcw size={12} aria-hidden="true" />}
              >
                Reverse
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
