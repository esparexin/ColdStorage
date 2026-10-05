import React from 'react';
import { Eye } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';

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
      render: (row) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {new Date(row.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
          {row.grnNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => <span style={{ fontWeight: 'var(--font-medium)' }}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => row.commodityName,
    },
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => (
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
          {row.chamber}
        </span>
      ),
    },
    {
      key: 'bags',
      header: 'Received',
      align: 'right',
      render: (row) => (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 'var(--font-semibold)', fontVariantNumeric: 'tabular-nums' }}>
            {row.bags.toLocaleString('en-IN')}
          </span>
          {(row.smallBags > 0 || row.bigBags > 0) && (
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {row.smallBags.toLocaleString('en-IN')}S / {row.bigBags.toLocaleString('en-IN')}B
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'netDeliveredBags',
      header: 'Outward',
      align: 'right',
      render: (row) => {
        const outward = row.netDeliveredBags ?? 0;
        return (
          <span style={{ fontVariantNumeric: 'tabular-nums', color: outward > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            {outward > 0 ? outward.toLocaleString('en-IN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'closingBags',
      header: 'Balance',
      align: 'right',
      render: (row) => {
        const balance = row.closingBags ?? row.bags;
        return (
          <span style={{ fontWeight: 'var(--font-bold)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>
            {balance.toLocaleString('en-IN')}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>
          {row.status}
        </Badge>
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
          onClick={() => onOpenMovement(row)}
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
