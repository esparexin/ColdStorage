'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  Printer,
  RotateCcw,
} from 'lucide-react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import styles from '../page.module.css';

interface DeliveryTableProps {
  deliveries: DeliveryChallan[];
  caption: string;
  canPrint: boolean;
  canReverse: boolean;
  printingId: string | null;
  onSelectDelivery: (delivery: DeliveryChallan) => void;
  onPrintChallan: (challanId: string) => void;
  onStartReversal: (delivery: DeliveryChallan) => void;
}

export function DeliveryTable({
  deliveries,
  caption,
  canPrint,
  canReverse,
  printingId,
  onSelectDelivery,
  onPrintChallan,
  onStartReversal,
}: DeliveryTableProps) {
  const columns: DataTableColumn<DeliveryChallan>[] = [
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
      key: 'grnNumber',
      header: 'GRN Source',
      render: (row) => <span style={{ fontWeight: 600 }}>{row.grnNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => <span>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{row.commodityName}</span>
          <span className={styles.tagChamber}>Chamber {row.chamberNumber}</span>
        </div>
      ),
    },
    {
      key: 'totalBags',
      header: 'Delivered Bags',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
          {row.totalBags.toLocaleString('en-IN')} bags
        </span>
      ),
    },
    {
      key: 'transport',
      header: 'Vehicle / Driver',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)' }}>
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
          icon={
            row.status === 'ISSUED' ? (
              <CheckCircle2 size={12} aria-hidden="true" />
            ) : (
              <Clock size={12} aria-hidden="true" />
            )
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionGroup}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectDelivery(row)}
            title="View Details"
            leftIcon={<Eye size={13} aria-hidden="true" />}
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
              leftIcon={<Printer size={13} aria-hidden="true" />}
            >
              Challan
            </Button>
          )}

          {row.status === 'ISSUED' && canReverse && (
            <Button
              variant="dangerOutline"
              size="sm"
              onClick={() => onStartReversal(row)}
              title="Reverse Delivery (Restores stock to positions)"
              leftIcon={<RotateCcw size={13} aria-hidden="true" />}
            >
              Reverse
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={deliveries}
      rowKey={(r) => r.id}
      caption={caption}
    />
  );
}
