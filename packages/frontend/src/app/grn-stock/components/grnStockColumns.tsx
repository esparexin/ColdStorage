import React from 'react';
import { Eye } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';

interface CreateGrnStockColumnsParams {
  onOpenMovement: (grn: Grn) => void;
}

export function createGrnStockColumns({
  onOpenMovement,
}: CreateGrnStockColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) => row.date,
      render: (row) => (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatDisplayDate(row.date)}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => (
        <span
          style={{
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          {row.grnNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => <span style={{ fontWeight: 'var(--font-medium)' }}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.commodityName,
      render: (row) => row.commodityName,
    },
    {
      key: 'chamber',
      header: 'Chamber',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.chamber,
      render: (row) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)',
          }}
        >
          {row.chamber}
        </span>
      ),
    },
    {
      key: 'bags',
      header: 'Received',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.bags,
      render: (row) => (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 'var(--font-semibold)', fontVariantNumeric: 'tabular-nums' }}>
            {row.bags.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            S/B: {row.bagType ?? 'S/B'}
          </span>
        </div>
      ),
    },
    {
      key: 'netDeliveredBags',
      header: 'Outward',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.netDeliveredBags ?? 0,
      render: (row) => {
        const outward = row.netDeliveredBags ?? 0;
        return (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: outward > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            }}
          >
            {outward > 0 ? outward.toLocaleString('en-IN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'closingBags',
      header: 'Balance',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.closingBags ?? row.bags,
      render: (row) => {
        const balance = row.closingBags ?? row.bags;
        return (
          <span
            style={{
              fontWeight: 'var(--font-bold)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
            }}
          >
            {balance.toLocaleString('en-IN')}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>{row.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMovement(row);
          }}
          title={`View GRN Stock Movement for ${row.grnNumber}`}
          aria-label={`View GRN Stock Movement for ${row.grnNumber}`}
          leftIcon={<Eye size={14} aria-hidden="true" />}
        >
          View
        </Button>
      ),
    },
  ];
}
